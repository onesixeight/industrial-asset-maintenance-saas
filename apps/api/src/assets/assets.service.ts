import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as QRCode from "qrcode";
import type {
  AssetFilters,
  AssetResponse,
  CreateAssetRequest,
  UpdateAssetRequest,
} from "@iam/shared";
import { PrismaService } from "../prisma";

/** Opaque, URL-safe, scan-stable token (192 bits of entropy). */
function generateQrToken(): string {
  return randomBytes(24).toString("base64url");
}

type AssetRow = {
  id: string;
  name: string;
  description: string | null;
  serialNumber: string | null;
  qrCode: string;
  status: AssetResponse["status"];
  locationId: string;
  categoryId: string;
  companyId: string;
  purchaseDate: Date | null;
  warrantyDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Prisma returns Date for the temporal fields; the API contract uses ISO strings. */
function toAssetResponse(a: AssetRow): AssetResponse {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    serialNumber: a.serialNumber,
    qrCode: a.qrCode,
    status: a.status,
    locationId: a.locationId,
    categoryId: a.categoryId,
    companyId: a.companyId,
    purchaseDate: a.purchaseDate ? a.purchaseDate.toISOString() : null,
    warrantyDate: a.warrantyDate ? a.warrantyDate.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/**
 * Multi-tenant Asset CRUD + opaque QR lifecycle. Every read/write is scoped to
 * the caller's companyId; cross-tenant lookups (by id or QR token) surface as
 * 404 so response codes don't leak other tenants' records. QR tokens are
 * generated server-side (never from the client), encoded in a printed QR as
 * the public scan URL, and rotated by overwriting (invalidating the old sticker).
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // --- CRUD ---------------------------------------------------------------

  async list(companyId: string, filters: AssetFilters): Promise<AssetResponse[]> {
    const rows = await this.prisma.getClient().asset.findMany({
      where: {
        companyId,
        name: filters.search
          ? { contains: filters.search, mode: "insensitive" }
          : undefined,
        status: filters.status,
        locationId: filters.locationId,
        categoryId: filters.categoryId,
      },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    });
    return rows.map(toAssetResponse);
  }

  async get(id: string, companyId: string): Promise<AssetResponse> {
    const asset = await this.prisma.getClient().asset.findFirst({
      where: { id, companyId },
    });
    if (!asset) throw new NotFoundException();
    return toAssetResponse(asset);
  }

  async create(input: CreateAssetRequest, companyId: string): Promise<AssetResponse> {
    await this.validateFks(input.locationId, input.categoryId, companyId);
    // Generate an opaque token; on the astronomically-unlikely qrCode P2002,
    // retry once with fresh entropy before surfacing the error.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const row = await this.prisma.getClient().asset.create({
          data: { ...input, qrCode: generateQrToken(), companyId },
        });
        return toAssetResponse(row);
      } catch (err) {
        if ((err as { code?: string }).code === "P2002" && attempt === 0) continue;
        throw err;
      }
    }
    // Unreachable in practice; keeps the type-checker happy without a non-null assertion.
    throw new Error("qrCode generation failed twice");
  }

  async update(
    id: string,
    input: UpdateAssetRequest,
    companyId: string,
  ): Promise<AssetResponse> {
    const existing = await this.get(id, companyId);
    // qrCode is read-only: the update schema omits it, so it can never arrive here.
    if (input.locationId || input.categoryId) {
      await this.validateFks(
        input.locationId ?? existing.locationId,
        input.categoryId ?? existing.categoryId,
        companyId,
      );
    }
    const row = await this.prisma.getClient().asset.update({ where: { id }, data: input });
    return toAssetResponse(row);
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.get(id, companyId);
    const [workOrders, inspections] = await Promise.all([
      this.prisma.getClient().workOrder.count({ where: { assetId: id, companyId } }),
      this.prisma.getClient().inspection.count({ where: { assetId: id, companyId } }),
    ]);
    if (workOrders + inspections > 0) {
      throw new ConflictException("Asset has work orders or inspections");
    }
    await this.prisma.getClient().asset.delete({ where: { id } });
  }

  // --- QR -----------------------------------------------------------------

  /** Resolve a scanned token to the asset (authed; cross-tenant → 404). */
  async findByQr(token: string, companyId: string): Promise<AssetResponse> {
    const asset = await this.prisma.getClient().asset.findFirst({
      where: { qrCode: token, companyId },
    });
    if (!asset) throw new NotFoundException();
    return toAssetResponse(asset);
  }

  /** Overwrite qrCode — the old printed sticker's token then 404s on scan. */
  async rotateQr(id: string, companyId: string): Promise<AssetResponse> {
    await this.get(id, companyId);
    const row = await this.prisma.getClient().asset.update({
      where: { id },
      data: { qrCode: generateQrToken() },
    });
    return toAssetResponse(row);
  }

  /** SVG markup encoding the public scan URL for the asset's QR token. */
  async getQrSvg(id: string, companyId: string): Promise<string> {
    const asset = await this.get(id, companyId);
    const base =
      this.config.get<string>("PUBLIC_SCAN_BASE") ?? "http://localhost:3000";
    const payload = `${base}/assets/qr/${asset.qrCode}`;
    return QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M" });
  }

  // --- helpers ------------------------------------------------------------

  /** locationId and categoryId must belong to the caller's company. */
  private async validateFks(
    locationId: string,
    categoryId: string,
    companyId: string,
  ): Promise<void> {
    const [loc, cat] = await Promise.all([
      this.prisma.getClient().location.findFirst({
        where: { id: locationId, companyId },
      }),
      this.prisma.getClient().category.findFirst({
        where: { id: categoryId, companyId },
      }),
    ]);
    if (!loc || !cat) {
      throw new BadRequestException("Invalid location or category for this company");
    }
  }
}

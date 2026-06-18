import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from "@nestjs/common";
import type { ZodTypeAny } from "zod";

/**
 * Generic pipe that validates an inbound value against a Zod schema.
 * On failure throws BadRequestException with the joined issue messages.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new BadRequestException(message);
    }
    return result.data;
  }
}

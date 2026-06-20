import { Module } from "@nestjs/common";
import { WorkOrdersController } from "./work-orders.controller";
import { WorkOrdersService } from "./work-orders.service";
import { WorkOrderPartsService } from "./work-order-parts.service";

@Module({
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, WorkOrderPartsService],
})
export class WorkOrdersModule {}

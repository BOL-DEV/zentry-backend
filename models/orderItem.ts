import { createModel } from "../db/orm";

export interface IOrderItem {
  _id: string;
  orderId: string;
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const OrderItem = createModel<IOrderItem>({
  modelName: "OrderItem",
  tableName: "order_items",
  fields: {
    _id: "id",
    orderId: "order_id",
    ticketTypeId: "ticket_type_id",
    ticketTypeName: "ticket_type_name",
    quantity: "quantity",
    unitPrice: "unit_price",
    subtotal: "subtotal",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  relations: {
    orderId: { modelName: "Order" },
    ticketTypeId: { modelName: "TicketType" },
  },
});

export default OrderItem;


import { createModel } from "../db/orm";

export interface ITicketType {
  _id: string;
  eventId: string;
  name: string;
  description?: string;
  price: number;
  quantityAvailable: number;
  quantitySold: number;
  quantityReserved: number;
  isActive: boolean;
  displayOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const TicketType = createModel<ITicketType>({
  modelName: "TicketType",
  tableName: "ticket_types",
  fields: {
    _id: "id",
    eventId: "event_id",
    name: "name",
    description: "description",
    price: "price",
    quantityAvailable: "quantity_available",
    quantitySold: "quantity_sold",
    quantityReserved: "quantity_reserved",
    isActive: "is_active",
    displayOrder: "display_order",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  relations: {
    eventId: { modelName: "Event" },
  },
});


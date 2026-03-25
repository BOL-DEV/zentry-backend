import { model, Schema, Document, Types } from "mongoose";

export interface IOrderItem extends Document {
  orderId: string;
  ticketTypeId: string;
  quantity: number;
  price: number;
}

const OrderItemSchema = new Schema({
    orderId: {
        type: Schema.Types.ObjectId,
        ref: "Order",
        required: [true, "Order item must belong to an order"],
        index: true,
    },
    ticketTypeId: {
        type: Schema.Types.ObjectId,
        ref: "TicketType",  
        required: [true, "Order item must belong to a ticket type"],
        index: true,
    },

    ticketTypeName: {
        type: String,
        required: [true, "Order item must have a ticket type name"],
        trim: true,
    },

    quantity: {
        type: Number,
        required: [true, "Order item must have a quantity"],
        min: [1, "Quantity must be at least 1"],        
    },
    unitPrice: {
        type: Number,
        required: [true, "Order item must have a unit price"],
        min: [0, "Unit price cannot be negative"],
    },
    subtotal: {
        type: Number,
        required: [true, "Order item must have a subtotal"],
        min: [0, "Subtotal cannot be negative"],
    },
}, {
    timestamps: true,
    versionKey: false,
});


const OrderItem = model<IOrderItem>("OrderItem", OrderItemSchema);
 
export default OrderItem;
import {nanoid} from "nanoid"

export const generatePaymentReference = (): string => {
    return `ORD-${nanoid(12).toUpperCase()}`;
}
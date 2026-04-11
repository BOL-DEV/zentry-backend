import axios from "axios";
import { AppError } from "../utils/appError";

const SQUAD_SECRET_KEY = process.env.SQUAD_API_KEY;
const SQUAD_BASE_URL = "https://sandbox-api-d.squadco.com";

const squadApi = axios.create({
  baseURL: SQUAD_BASE_URL,
  headers: {
    Authorization: `Bearer ${SQUAD_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

const handleSquadRequestError = (
  error: unknown,
  fallbackMessage: string,
): never => {
  if (axios.isAxiosError(error)) {
    console.log("Squad Error Data:", error.response?.data);
    const responseData = error.response?.data as
      | { message?: string; error?: string }
      | undefined;
    const message =
      responseData?.message ||
      responseData?.error ||
      error.message ||
      fallbackMessage;
    const statusCode = error.response?.status || 500;
    throw new AppError(message, statusCode);
  }
  throw new AppError(fallbackMessage, 500);
};

export const SquadService = {
  initiatePayment: async (paymentData: {
    amount: number; // in Kobo
    email: string;
    transaction_ref: string;
    customer_name: string;
    callback_url?: string;
  }) => {
    try {
      const response = await squadApi.post("/transaction/initiate", {
        amount: paymentData.amount,
        email: paymentData.email,
        transaction_ref: paymentData.transaction_ref,
        customer_name: paymentData.customer_name,
        currency: "NGN",
        initiate_type: "inline", // Forces the modal/checkout flow
        callback_url: paymentData.callback_url,
        pass_charge: false, // You pay the 1.5% fee from the total
      });

      // Returns { checkout_url: "..." }
      return response.data.data;
    } catch (error) {
      handleSquadRequestError(error, "Failed to initiate Squad payment");
    }
  },

  /**
   * PAYOUT TO ORGANIZER
   */
  transferToOrganizer: async (payoutData: {
    amount: number; // in Kobo
    bank_code: string;
    account_number: string;
    account_name: string;
    transaction_reference: string;
  }) => {
    try {
      const response = await squadApi.post("/payout/transfer", {
        remark: "Zentry Organizer Payout",
        ...payoutData,
      });
      return response.data;
    } catch (error) {
      handleSquadRequestError(error, "Failed to transfer payout via Squad");
    }
  },
};

import axios from "axios";
import { AppError } from "../utils/appError";

const SQUAD_SECRET_KEY = process.env.SQUAD_API_KEY;
const SQUAD_BASE_URL = "https://sandbox-api-d.squadco.com";

// Real https://api-d.squadco.com

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
    console.log("Squad Error Status:", error.response?.status);

    const responseData = error.response?.data as
      | { message?: string; error?: string }
      | undefined;

    const message =
      responseData?.message ||
      responseData?.error ||
      error.message ||
      fallbackMessage;

    const statusCode =
      typeof error.response?.status === "number" && error.response.status >= 400
        ? error.response.status
        : 500;

    throw new AppError(message, statusCode);
  }

  throw new AppError(fallbackMessage, 500);
};

export const SquadService = {
  createVirtualAccount: async (orderData: {
    first_name: string;
    last_name: string;
    email: string;
    mobile_num: string;
    amount: number;
    transaction_ref: string;
  }) => {
    try {
      const response = await squadApi.post("/virtual-account", {
        ...orderData,
        // This identifies the order in the webhook later
        customer_identifier: orderData.transaction_ref,
      });
      return response.data.data;
    } catch (error) {
      handleSquadRequestError(error, "Failed to create Squad virtual account");
    }
  },

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

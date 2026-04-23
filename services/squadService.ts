import axios from "axios";
import { AppError } from "../utils/appError";

const SQUAD_API_KEY = process.env.SQUAD_API_KEY;
const SQUAD_BASE_URL = process.env.SQUAD_BASE_URL || "https://api-d.squadco.com";

const maskAccountNumber = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!/^\d{10,}$/.test(trimmed)) return trimmed;
  return `${"*".repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
};

const sanitizeLogData = (value: unknown): unknown => {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeLogData(item));

  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, v] of Object.entries(record)) {
    if (
      typeof v === "string" &&
      [
        "account_number",
        "accountNumber",
        "account_number_credited",
        "accountNumberCredited",
      ].includes(key)
    ) {
      out[key] = maskAccountNumber(v);
      continue;
    }

    out[key] = sanitizeLogData(v);
  }

  return out;
};

const ensureMerchantPrefixedReference = (reference: string) => {
  const merchantId = String(process.env.SQUAD_MERCHANT_ID || "").trim();
  const trimmedRef = String(reference || "").trim();

  if (!trimmedRef) {
    throw new AppError("transaction_reference is required", 400);
  }

  if (!merchantId) {
    throw new AppError("SQUAD_MERCHANT_ID is not configured", 500);
  }

  const prefix = `${merchantId}_`;
  return trimmedRef.startsWith(prefix) ? trimmedRef : `${prefix}${trimmedRef}`;
};

const squadApi = axios.create({
  baseURL: SQUAD_BASE_URL,
  headers: {
    Authorization: `Bearer ${SQUAD_API_KEY}`,
    "Content-Type": "application/json",
  },
});

const handleSquadRequestError = (
  error: unknown,
  fallbackMessage: string,
): never => {
  if (error instanceof AppError) {
    throw error;
  }

  if (axios.isAxiosError(error)) {
    const method = (error.config?.method || "").toUpperCase();
    const url = `${error.config?.baseURL || ""}${error.config?.url || ""}`;
    const status = error.response?.status;

    console.log("Squad Error:", {
      method,
      url,
      status,
      data: sanitizeLogData(error.response?.data),
    });

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
    if (!process.env.SQUAD_API_KEY) {
      throw new AppError("SQUAD_API_KEY is not configured", 500);
    }

    try {
      const response = await squadApi.post("/transaction/initiate", {
        amount: paymentData.amount,
        email: paymentData.email,
        transaction_ref: paymentData.transaction_ref,
        customer_name: paymentData.customer_name,
        currency: "NGN",
        initiate_type: "inline",
        callback_url: paymentData.callback_url,
        pass_charge: false,
      });

      return response.data.data;
    } catch (error) {
      return handleSquadRequestError(error, "Failed to initiate Squad payment");
    }
  },

  lookupBankAccount: async (lookupData: {
    bank_code: string;
    account_number: string;
  }): Promise<{ account_name: string; account_number: string }> => {
    if (!process.env.SQUAD_API_KEY) {
      throw new AppError("SQUAD_API_KEY is not configured", 500);
    }

    try {
      const response = await squadApi.post("/payout/account/lookup", {
        bank_code: lookupData.bank_code,
        account_number: lookupData.account_number,
      });

      const data = response.data?.data;

      if (!data || typeof data !== "object") {
        console.log("Squad account lookup unexpected response:", {
          bank_code: lookupData.bank_code,
          account_number: maskAccountNumber(lookupData.account_number),
          response: sanitizeLogData(response.data),
        });
        throw new AppError(
          "Squad account lookup returned an unexpected response",
          502,
        );
      }

      const accountName =
        typeof (data as any)?.account_name === "string"
          ? String((data as any).account_name)
          : "";
      const accountNumber =
        typeof (data as any)?.account_number === "string"
          ? String((data as any).account_number)
          : "";

      if (!accountName || !accountNumber) {
        console.log("Squad account lookup missing fields:", {
          bank_code: lookupData.bank_code,
          account_number: maskAccountNumber(lookupData.account_number),
          response: sanitizeLogData(response.data),
        });
        throw new AppError(
          "Squad account lookup failed (invalid bank details)",
          400,
        );
      }

      return { account_name: accountName, account_number: accountNumber };
    } catch (error) {
      return handleSquadRequestError(error, "Failed to lookup bank account via Squad");
    }
  },

  transferToOrganizer: async (payoutData: {
    amount: number; // in Kobo
    bank_code: string;
    account_number: string;
    account_name: string;
    transaction_reference: string;
  }) => {
    if (!process.env.SQUAD_API_KEY) {
      throw new AppError("SQUAD_API_KEY is not configured", 500);
    }

    try {
      const lookup = await SquadService.lookupBankAccount({
        bank_code: payoutData.bank_code,
        account_number: payoutData.account_number,
      });

      const transaction_reference = ensureMerchantPrefixedReference(
        payoutData.transaction_reference,
      );

      const response = await squadApi.post("/payout/transfer", {
        remark: `ZENTRY_${transaction_reference}`,
        bank_code: payoutData.bank_code,
        currency_id: "NGN",
        amount: String(payoutData.amount),
        account_number: lookup.account_number,
        transaction_reference,
        account_name: lookup.account_name,
      });

      return response.data;
    } catch (error) {
      return handleSquadRequestError(error, "Failed to transfer payout via Squad");
    }
  },
};

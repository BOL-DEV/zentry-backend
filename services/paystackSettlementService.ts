import axios from "axios";
import { AppError } from "../utils/appError";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

type PaystackSettlement = {
  id: number;
  status: "success" | "processing" | "pending" | "failed";
  created_at: string;
  updated_at: string;
  integration: number;
  domain: string;
  total_amount: number;
  effective_amount: number;
  total_fees: number;
  total_processed: number;
  deductions: null | number;
  settlement_date: string;
  settled_by: string | null;
  bank_code?: string;
  bank_name?: string;
  account_number?: string;
  subaccount_id?: number | null;
};

type PaystackSettlementTransaction = {
  id: number;
  domain: string;
  status: string;
  reference: string;
  amount: number;
  message: string | null;
  gateway_response: string;
  paid_at: string;
  created_at: string;
  channel: string;
  currency: string;
  fees?: number;
  customer?: {
    email?: string;
  };
};

type PaystackListResponse<T> = {
  status: boolean;
  message: string;
  data: T[];
  meta?: {
    total?: number;
    skipped?: number;
    perPage?: number;
    page?: number;
    pageCount?: number;
  };
};

const paystackClient = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

export const listSettlements = async (params?: {
  from?: string;
  to?: string;
  subaccount?: string;
  status?: "success" | "processing" | "pending" | "failed";
  page?: number;
  perPage?: number;
}) => {
  try {
    const response = await paystackClient.get<
      PaystackListResponse<PaystackSettlement>
    >("/settlement", { params });

    if (!response.data.status) {
      throw new AppError("Failed to fetch settlements from Paystack", 502);
    }

    return response.data.data;
  } catch (error) {
    throw new AppError("Unable to fetch settlements from Paystack", 502);
  }
};

export const listSettlementTransactions = async (
  settlementId: number,
  params?: {
    page?: number;
    perPage?: number;
  },
) => {
  try {
    const response = await paystackClient.get<
      PaystackListResponse<PaystackSettlementTransaction>
    >(`/settlement/${settlementId}/transaction`, { params });

    if (!response.data.status) {
      throw new AppError(
        "Failed to fetch settlement transactions from Paystack",
        502,
      );
    }

    return response.data.data;
  } catch (error) {
    throw new AppError(
      `Unable to fetch transactions for settlement ${settlementId}`,
      502,
    );
  }
};

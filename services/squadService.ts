import axios from "axios";
import { AppError } from "../utils/appError";

const SQUAD_API_KEY = process.env.SQUAD_API_KEY;
const SQUAD_BASE_URL = "https://api-d.squadco.com";
const SQUAD_MERCHANT_ID = process.env.SQUAD_MERCHANT_ID;

const squadApi = axios.create({
  baseURL: SQUAD_BASE_URL,
  headers: {
    Authorization: `Bearer ${SQUAD_API_KEY}`,
    "Content-Type": "application/json",
  },
});

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
        initiate_type: "inline", // Forces the modal/checkout flow
        callback_url: paymentData.callback_url,
        pass_charge: false, // You pay the 1.5% fee from the total
      });

      // Returns { checkout_url: "..." }
      return response.data.data;
    } catch (error) {
      throw new AppError("Failed to initiate Squad payment", 500);
    }
  },

  lookupBankAccount: async (lookupData: {
    bank_code: string;
    account_number: string;
  }): Promise<{ account_name: string; account_number: string }> => {
    try {
      const response = await squadApi.post("/payout/account/lookup", {
        bank_code: lookupData.bank_code,
        account_number: lookupData.account_number,
      });

      const data = response.data?.data;

      // const accountName =
      //   typeof data?.account_name === "string" ? data.account_name : "";
      // const accountNumber =
      //   typeof data?.account_number === "string" ? data.account_number : "";

      // if (!accountName || !accountNumber) {
      //   throw new AppError("Failed to lookup bank account", 400);
      // }

      // return { account_name: accountName, account_number: accountNumber };

      return data;
    } catch (error) {
      throw new AppError("Failed to lookup bank account via Squad", 500);
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
      // Squad requires the account to be looked up/vetted before transfer.
      const lookup = await SquadService.lookupBankAccount({
        bank_code: payoutData.bank_code,
        account_number: payoutData.account_number,
      });

      // Squad docs: transaction_reference must be unique and must include merchant ID.
      const transaction_reference = `${SQUAD_MERCHANT_ID}_${payoutData.transaction_reference}`;

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
      // throw new AppError("Failed to transfer payout via Squad", 500);
      throw error;
    }
  },

  //   requeryTransfer: async (transaction_reference: string) => {
  //     if (!process.env.SQUAD_API_KEY) {
  //       throw new AppError("SQUAD_API_KEY is not configured", 500);
  //     }

  //     try {
  //       const response = await squadApi.post("/payout/requery", {
  //         transaction_reference: ensureMerchantPrefixedReference(
  //           transaction_reference,
  //         ),
  //       });
  //       return response.data;
  //     } catch (error) {
  //       throw new AppError("Failed to requery transfer via Squad", 500);
  //     }
  //   },
};

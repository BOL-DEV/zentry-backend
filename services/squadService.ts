import axios from "axios";

const SQUAD_SECRET_KEY = process.env.SQUAD_SECRET_KEY;
const SQUAD_BASE_URL = 'https://sandbox-api-d.squadco.com'

// Real https://api-d.squadco.com

const squadApi = axios.create({
  baseURL: SQUAD_BASE_URL,
  headers: {
    Authorization: `Bearer ${SQUAD_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

export const SquadService = {
  createVirtualAccount: async (orderData: {
    first_name: string;
    last_name: string;
    email: string;
    mobile_num: string;
    amount: number;
    transaction_ref: string;
  }) => {
    const response = await squadApi.post("/virtual-account", {
      ...orderData,
      // This identifies the order in the webhook later
      customer_identifier: orderData.transaction_ref,
    });
    return response.data.data;
  },

  transferToOrganizer: async (payoutData: {
    amount: number; // in Kobo
    bank_code: string;
    account_number: string;
    account_name: string;
    transaction_reference: string;
  }) => {
    const response = await squadApi.post("/payout/transfer", {
      remark: "Zentry Organizer Payout",
      ...payoutData,
    });
    return response.data;
  },
};

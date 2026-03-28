# EventFlow Backend API Documentation

## Overview
- **Base URL:** `/api/v1`
- **Content-Type:** `application/json` (except Paystack webhook which is raw JSON but still sent as `application/json`)
- **Auth:** No authentication is implemented in this codebase (no JWT/session middleware on routes).

## Environment variables
Set these in `.env` (loaded by `config/db.ts`).

- `PORT` (optional, default `4000`)
- `NODE_ENV` (`development` enables stack traces in errors)
- `MONGO_URI` (e.g. MongoDB connection string, can contain `<db_password>` placeholder)
- `DB_PASSWORD` (used to replace `<db_password>` in `MONGO_URI`)
- `PAYSTACK_SECRET_KEY` (required for payment init + webhook verification)
- `PAYSTACK_CALLBACK_URL` (required for payment init)

## Common response shapes

### Success
Most endpoints return:

```json
{
  "status": "success",
  "data": {}
}
```

Some endpoints also include:
- `results`: number of returned items
- `message`: human-readable message

### Errors
Errors are normalized by the global error handler.

**Production (`NODE_ENV !== development`)**

```json
{
  "status": "error",
  "message": "..."
}
```

**Development (`NODE_ENV === development`)**

```json
{
  "status": "error",
  "message": "...",
  "error": { "...": "..." },
  "stack": "..."
}
```

Validation errors can come from:
- **Zod** request validation → `400`
- **Mongoose** validation/duplicate key errors → `400`

---

## Data models (high level)
These are the main entities you’ll see in responses.

### Organizer
Fields (as stored):
- `name` (string)
- `slug` (string)
- `logoUrl` (string URL)
- `heroTitle` (string)
- `heroSubtitle` (string)
- `about` (string)
- `contactEmail` (string)
- `contactPhone` (string)
- `paystackSubaccountCode` (string)
- `createdAt`, `updatedAt` (ISO dates)

### Event
Fields:
- `organizerId` (ObjectId)
- `title`, `description`, `location`, `posterUrl`, `dressCode`, `policies` (strings)
- `date` (ISO date)
- `createdAt`, `updatedAt`

### Gallery Item
Fields:
- `organizerId` (ObjectId)
- `imageUrl` (string URL)
- `caption` (string, default `""`)
- `altText` (string, default `""`)
- `displayOrder` (number, default `0`)
- `createdAt`, `updatedAt`

### Ticket Type
Fields:
- `eventId` (ObjectId)
- `name` (string, stored uppercased)
- `description` (string)
- `price` (number, in naira)
- `quantityAvailable` (number)
- `quantitySold` (number)
- `isActive` (boolean)
- `displayOrder` (number)
- `createdAt`, `updatedAt`

### Order
Fields:
- `eventId` (ObjectId)
- `buyerName`, `buyerEmail` (string)
- `buyerPhone` (string, optional)
- `totalAmount` (number, in naira)
- `paymentStatus` (`pending` | `paid` | `cancelled`)
- `paymentReference` (string, optional)
- `createdAt`, `updatedAt`

### Order Item
Fields:
- `orderId` (ObjectId)
- `ticketTypeId` (ObjectId)
- `ticketTypeName` (string)
- `unitPrice` (number)
- `quantity` (number)
- `subtotal` (number)
- `createdAt`, `updatedAt`

### Ticket
Fields:
- `eventId`, `ticketTypeId`, `orderId` (ObjectId)
- `buyerName`, `buyerEmail` (string)
- `ticketCode` (string)
- `status` (`valid` | `checked-in`)
- `createdAt`, `updatedAt`

---

## Health

### GET `/`
Returns a welcome payload.

**Response 200**
```json
{
  "status": "success",
  "message": "Welcome to the EventFlow API!"
}
```

---

## Organizer API
Mounted at: `/api/v1/organizer`

### POST `/api/v1/organizer/`
Create an organizer.

**Request body**
```json
{
  "name": "EventFlow",
  "logoUrl": "https://example.com/logo.png",
  "heroTitle": "We host experiences",
  "heroSubtitle": "Find events you love",
  "about": "EventFlow organizes amazing events...",
  "contactEmail": "hello@example.com",
  "contactPhone": "+2348012345678",
  "paystackSubaccountCode": "ACCT_xxxxxxxxxx"
}
```

**Notes**
- `slug` is auto-generated from `name`.
- If an organizer with the same generated slug already exists → `400`.

**Response 201**
```json
{
  "status": "success",
  "data": {
    "organizer": {
      "_id": "...",
      "name": "EventFlow",
      "slug": "eventflow",
      "logoUrl": "...",
      "heroTitle": "...",
      "heroSubtitle": "...",
      "about": "...",
      "contactEmail": "...",
      "contactPhone": "...",
      "paystackSubaccountCode": "ACCT_xxxxxxxxxx",
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
```

### GET `/api/v1/organizer/:slug`
Fetch organizer by slug.

**Path params**
- `slug` (string): organizer slug

**Response 200**
```json
{
  "status": "success",
  "data": { "organizer": { "_id": "...", "slug": "..." } }
}
```

**Errors**
- `404 Organizer not found`

---

## Gallery API
Mounted under organizer routes.

### POST `/api/v1/organizer/:slug/gallery`
Create a gallery item for an organizer.

**Request body**
```json
{
  "imageUrl": "https://example.com/photo.jpg",
  "caption": "Optional caption",
  "altText": "Optional alt text",
  "displayOrder": 0
}
```

**Response 201**
```json
{
  "status": "success",
  "data": { "galleryItem": { "_id": "...", "imageUrl": "..." } }
}
```

**Errors**
- `404 Organizer not found`
- `400 This gallery image already exists for this organizer`

### GET `/api/v1/organizer/:slug/gallery`
List gallery items for an organizer.

**Response 200**
```json
{
  "status": "success",
  "data": {
    "organizer": { "slug": "..." },
    "results": 1,
    "gallery": [ { "_id": "...", "imageUrl": "..." } ]
  }
}
```

---

## Event API

### POST `/api/v1/organizer/:slug/events`
Create an event for an organizer.

**Request body**
```json
{
  "title": "My Event",
  "description": "Event description",
  "date": "2026-04-01T18:00:00.000Z",
  "location": "Lagos",
  "posterUrl": "https://example.com/poster.png",
  "dressCode": "Smart casual",
  "policies": "No refunds"
}
```

**Response 201**
```json
{
  "status": "success",
  "data": {
    "organizer": { "slug": "...", "name": "..." },
    "event": { "_id": "...", "title": "..." }
  }
}
```

**Errors**
- `404 Organizer not found`
- `400` if an event with same `title` and `date` already exists for organizer

### GET `/api/v1/organizer/:slug/events`
List events for an organizer.

**Response 200**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "organizer": { "slug": "...", "name": "..." },
    "events": [ { "_id": "...", "title": "..." } ]
  }
}
```

### GET `/api/v1/organizer/:slug/events/:eventId`
Get an organizer event by event id.

**Path params**
- `slug` (string)
- `eventId` (24-char hex string)

**Response 200**
```json
{
  "status": "success",
  "data": {
    "organizer": { "slug": "...", "name": "..." },
    "event": { "_id": "...", "title": "..." }
  }
}
```

**Errors**
- `404 Organizer not found`
- `404 Event not found`
- `404 Event not found for this organizer`

### GET `/api/v1/events/`
List all events (public).

**Response 200**
```json
{
  "status": "success",
  "results": 1,
  "data": { "events": [ { "_id": "...", "title": "..." } ] }
}
```

---

## Ticket Type API

### POST `/api/v1/organizer/:slug/events/:eventId/ticket-types`
Create a ticket type under an event.

**Request body**
```json
{
  "name": "Regular",
  "description": "Optional description",
  "price": 5000,
  "quantityAvailable": 100,
  "displayOrder": 0
}
```

**Response 201**
```json
{
  "status": "success",
  "data": {
    "organizer": { "slug": "...", "name": "..." },
    "event": { "id": "...", "title": "..." },
    "ticketType": { "_id": "...", "name": "REGULAR", "price": 5000 }
  }
}
```

**Errors**
- `404 Organizer not found`
- `404 Event not found for this organizer`
- `400 Ticket type with this name already exists for this event`

### GET `/api/v1/organizer/:slug/events/:eventId/ticket-types`
List ticket types for an event.

**Response 200**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "organizer": { "slug": "...", "name": "..." },
    "event": { "id": "...", "title": "..." },
    "ticketTypes": [ { "_id": "...", "name": "REGULAR" } ]
  }
}
```

---

## Purchase + Order API

### POST `/api/v1/organizer/:slug/events/:eventId/purchases`
Create a purchase (creates an Order + OrderItems) for the given event.

**Request body**
```json
{
  "buyerName": "Jane Doe",
  "buyerEmail": "jane@example.com",
  "buyerPhone": "+2348012345678",
  "items": [
    { "ticketTypeId": "<24-char-hex>", "quantity": 2 }
  ]
}
```

**Rules**
- `items` must contain at least 1 item.
- Duplicate `ticketTypeId` values inside `items` are rejected.
- Ticket type must belong to the event and be active.
- Quantity must not exceed available stock.

**Response 201**
```json
{
  "status": "success",
  "data": {
    "order": {
      "id": "...",
      "eventId": "...",
      "buyerName": "...",
      "buyerEmail": "...",
      "buyerPhone": "...",
      "totalAmount": 10000,
      "paymentStatus": "pending",
      "paymentReference": null
    },
    "items": [
      {
        "ticketTypeId": "...",
        "ticketTypeName": "REGULAR",
        "quantity": 2,
        "unitPrice": 5000,
        "subtotal": 10000
      }
    ]
  }
}
```

---

## Order Payment API (Paystack initialize)
Mounted at: `/api/v1/orders`

### POST `/api/v1/orders/:orderId/pay`
Initialize payment for an order with Paystack split.

**Path params**
- `orderId` (24-char hex string)

**Behavior**
- Only works if `order.paymentStatus === "pending"` and `order.totalAmount > 0`.
- Requires organizer `paystackSubaccountCode`.
- Uses Paystack split (`subaccount`, `transaction_charge`, `bearer=subaccount`).
- Platform fee rule:
  - If a ticket’s unit price < ₦3500 → platform fee is ₦100 for that ticket
  - If unit price ≥ ₦3500 → platform fee is 3% of that ticket’s unit price
  - Total fee = sum across order items

**Response 200**
```json
{
  "status": "success",
  "data": {
    "order": {
      "id": "...",
      "buyerName": "...",
      "buyerEmail": "...",
      "totalAmount": 10000,
      "paymentStatus": "pending",
      "paymentReference": "..."
    },
    "payment": {
      "provider": "paystack",
      "authorizationUrl": "https://checkout.paystack.com/...",
      "accessCode": "...",
      "reference": "..."
    },
    "split": {
      "organizerId": "...",
      "subaccount": "ACCT_xxxxxxxxxx",
      "totalTickets": 2,
      "platformFeeRule": {
        "thresholdNaira": 3500,
        "belowThresholdFlatNaira": 100,
        "aboveThresholdPercent": 3
      },
      "platformFeeTotalKobo": 30000,
      "platformFeeTotal": 300
    }
  }
}
```

**Errors**
- `404 Order not found`
- `400 This order is not eligible for payment initialization`
- `400 Invalid order amount`
- `400 Organizer payment setup is incomplete`
- `400 Platform fee exceeds or equals the order amount; cannot initialize split payment`
- `500` if Paystack secret/callback is missing or Paystack initialization fails

---

## Tickets for an Order
Mounted at: `/api/v1/orders`

### GET `/api/v1/orders/:orderId/tickets`
Return the order summary and generated tickets.

**Notes**
- Tickets are only created after successful Paystack webhook confirmation.

**Response 200**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "order": {
      "id": "...",
      "buyerName": "...",
      "buyerEmail": "...",
      "buyerPhone": "...",
      "totalAmount": 10000,
      "paymentStatus": "paid",
      "paymentReference": "...",
      "createdAt": "..."
    },
    "tickets": [
      {
        "_id": "...",
        "ticketCode": "...",
        "status": "valid",
        "eventId": "...",
        "ticketTypeId": "...",
        "orderId": "...",
        "buyerName": "...",
        "buyerEmail": "..."
      }
    ]
  }
}
```

---

## Paystack Webhook API
Mounted at: `/api/v1/payments`

### POST `/api/v1/payments/webhook`
Paystack webhook receiver.

**Headers**
- `x-paystack-signature`: required (HMAC SHA512 signature)

**Body**
- Raw Paystack event payload (the handler only processes `charge.success`).

**Behavior**
- Verifies signature using `PAYSTACK_SECRET_KEY`.
- Verifies transaction status using Paystack verify endpoint.
- Ensures paid amount matches `order.totalAmount`.
- Generates tickets, increments `quantitySold`, and marks order as `paid`.
- Idempotent: if order is already `paid`, it returns 200 with `"Order already processed"`.

**Response 200 (processed)**
```json
{
  "status": "success",
  "message": "Payment confirmed and tickets generated successfully"
}
```

**Response 200 (ignored event type)**
```json
{
  "status": "success",
  "message": "Webhook received and ignored"
}
```

**Errors**
- `400 Missing Paystack signature`
- `401 Invalid Paystack signature`
- `400 Payment verification failed`
- `404 Order not found for this payment reference`

---

## Ticket Verification API
Mounted at: `/api/v1/tickets`

### POST `/api/v1/tickets/verify`
Verify (check-in) a ticket by ticket code.

**Request body**
```json
{ "ticketCode": "ABC123" }
```

**Response 200**
```json
{
  "status": "success",
  "message": "Ticket verified successfully",
  "data": {
    "ticket": {
      "id": "...",
      "ticketCode": "ABC123",
      "status": "checked-in",
      "eventId": "...",
      "ticketTypeId": "...",
      "buyerName": "...",
      "buyerEmail": "..."
    }
  }
}
```

**Response 409 (already used)**
```json
{
  "status": "fail",
  "message": "Ticket has already been used",
  "data": {
    "ticketCode": "ABC123",
    "ticketStatus": "checked-in"
  }
}
```

**Errors**
- `404 Invalid ticket`
- `400` for invalid `ticketCode` shape

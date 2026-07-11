# QCFlow API

QCFlow business data is progressively moving behind Next.js Route Handlers. Authentication and database authorization remain based on Supabase Auth and Row Level Security.

## Authentication

Clients send the Supabase access token with every request:

```http
Authorization: Bearer <access-token>
```

The server validates the token before querying business tables. The user identifier supplied by request bodies is not trusted; create endpoints use the authenticated user id.

## Response format

Success:

```json
{
  "data": {},
  "error": null,
  "requestId": "uuid"
}
```

Failure:

```json
{
  "data": null,
  "error": {
    "message": "Human-readable message",
    "code": "ERROR_CODE"
  },
  "requestId": "uuid"
}
```

The same request id is returned in the `x-request-id` header and included in structured server logs.

## Current routes

- `GET, POST /api/orders`
- `GET, PATCH, DELETE /api/orders/:id`
- `POST /api/orders/transaction`
- `GET, POST, DELETE /api/order-items`
- `PATCH /api/order-items/:id`
- `GET, POST /api/inspections`
- `GET, POST /api/reinspections`

## Transactions

`POST /api/orders/transaction` creates an order and all of its line items atomically through the PostgreSQL function in:

```text
supabase/migrations/202607110001_create_order_transaction.sql
```

Apply the migration before switching production clients to the transaction endpoint. If any insert fails, PostgreSQL rolls back the entire operation.

## Logging

API logs are structured JSON and contain the request id, method, path, status and duration. Access tokens and request bodies are intentionally excluded.


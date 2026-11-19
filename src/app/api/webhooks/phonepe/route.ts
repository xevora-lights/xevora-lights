import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, cartItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPhonePeClient, getPhonePeConfig } from "@/utils/phonepe";

/**
 * Handle GET/HEAD requests so external monitoring, proxies, or PhonePe verification
 * checks receive an immediate 200 OK.
 */
export async function GET() {
  return NextResponse.json({ success: true, message: "PhonePe webhook endpoint active" }, { status: 200 });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const rawBody = await req.text();

    // Health-check / dashboard registration ping with empty body
    if (!rawBody || rawBody.trim().length === 0) {
      return NextResponse.json(
        { success: true, message: "Webhook validation ping acknowledged" },
        { status: 200 }
      );
    }

    const { username, password } = getPhonePeConfig();
    const phonepeClient = getPhonePeClient();

    let callbackResponse;
    try {
      callbackResponse = phonepeClient.validateCallback(
        username,
        password,
        authHeader,
        rawBody
      );
    } catch (validationError: unknown) {
      console.error("[PhonePe Webhook] Callback validation failed:", validationError);
      return NextResponse.json(
        { success: false, error: "Invalid callback signature or authentication" },
        { status: 401 }
      );
    }

    const payload = callbackResponse?.payload;
    if (!payload) {
      return NextResponse.json(
        { success: true, message: "Ping or non-order payload acknowledged" },
        { status: 200 }
      );
    }

    const merchantOrderId = payload.merchantOrderId || payload.orderId;
    const state = (payload.state || "").toUpperCase();
    const txnId = payload.paymentDetails?.[0]?.transactionId || payload.orderId || null;

    if (!merchantOrderId) {
      return NextResponse.json(
        { success: true, message: "Payload without order ID acknowledged" },
        { status: 200 }
      );
    }

    // Lookup order in DB by phonepeOrderId (merchantOrderId)
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.phonepeOrderId, merchantOrderId))
      .limit(1);

    if (!orderRows.length) {
      console.log(`[PhonePe Webhook] Order not found for merchantOrderId: ${merchantOrderId} (might be test event or already deleted).`);
      return NextResponse.json(
        { success: true, message: "Order not found or already deleted" },
        { status: 200 }
      );
    }

    const order = orderRows[0];
    const isSuccess = ["COMPLETED", "PAYMENT_SUCCESS", "SUCCESS"].includes(state);

    if (isSuccess) {
      // Move order status from "payment_pending" to "pending", paymentStatus to "paid"
      await db
        .update(orders)
        .set({
          status: "pending",
          paymentStatus: "paid",
          phonepePaymentId: txnId,
        })
        .where(eq(orders.id, order.id));

      // Clear cart items for the customer ONLY on confirmed payment
      if (order.userId) {
        await db.delete(cartItems).where(eq(cartItems.userId, order.userId));
      }

      console.log(`[PhonePe Webhook] Order #${order.id} payment confirmed successfully.`);
    } else {
      // Payment failed or cancelled: Delete unconfirmed pending order record
      // NOTE: Cart items are intentionally NOT deleted, allowing user to retry
      if (order.paymentStatus !== "paid") {
        await db.delete(orderItems).where(eq(orderItems.orderId, order.id));
        await db.delete(orders).where(eq(orders.id, order.id));
        console.log(`[PhonePe Webhook] Order #${order.id} payment failed with state: ${state}. Deleted pending order from DB.`);
      }
    }

    return NextResponse.json({ success: true, message: "Webhook processed" });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[PhonePe Webhook] Error processing webhook:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

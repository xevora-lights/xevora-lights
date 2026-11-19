import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, cartItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPhonePeClient } from "@/utils/phonepe";

function getBaseUrl(req: Request): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const reqOrigin = host ? `${proto}://${host}` : "";
  const rawBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || reqOrigin || "https://xevoralights.com";
  return rawBaseUrl.replace(/\/+$/, "");
}

async function handleCallback(req: Request) {
  const baseUrl = getBaseUrl(req);

  try {
    const { searchParams } = new URL(req.url);
    let merchantOrderId = searchParams.get("merchantOrderId");

    // In case PhonePe sends merchantOrderId in form body (POST)
    if (!merchantOrderId && req.method === "POST") {
      try {
        const formData = await req.formData();
        merchantOrderId = (formData.get("merchantOrderId") as string) || null;
      } catch {
        // Not form data
      }
    }

    if (!merchantOrderId) {
      console.error("[PhonePe Callback] Missing merchantOrderId query param");
      return NextResponse.redirect(`${baseUrl}/cart?error=missing_order_id`);
    }

    // Lookup corresponding order in DB
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.phonepeOrderId, merchantOrderId))
      .limit(1);

    if (!orderRows.length) {
      console.error(`[PhonePe Callback] Order not found for merchantOrderId: ${merchantOrderId}`);
      return NextResponse.redirect(`${baseUrl}/cart?error=order_not_found`);
    }

    const order = orderRows[0];

    let orderStatus;
    try {
      const phonepeClient = getPhonePeClient();
      orderStatus = await phonepeClient.getOrderStatus(merchantOrderId);
    } catch (statusError: unknown) {
      console.error(`[PhonePe Callback] Failed to fetch order status for ${merchantOrderId}:`, statusError);
      
      // If Webhook already confirmed payment, redirect gracefully to orders page
      if (order.paymentStatus === "paid") {
        return NextResponse.redirect(`${baseUrl}/profile/orders?payment=success&orderId=${order.id}`);
      }

      return NextResponse.redirect(`${baseUrl}/cart?error=status_verification_failed`);
    }

    const state = (orderStatus?.state || "").toUpperCase();
    const isSuccess = ["COMPLETED", "PAYMENT_SUCCESS", "SUCCESS"].includes(state);
    const txnId =
      orderStatus?.paymentDetails?.[0]?.transactionId ||
      orderStatus?.orderId ||
      order.phonepePaymentId;

    if (isSuccess || order.paymentStatus === "paid") {
      // Update order status if not already marked paid
      if (order.paymentStatus !== "paid" || order.status === "payment_pending") {
        await db
          .update(orders)
          .set({
            status: "pending",
            paymentStatus: "paid",
            phonepePaymentId: txnId,
          })
          .where(eq(orders.id, order.id));
      }

      // Clear user cart items in database ONLY on success
      if (order.userId) {
        await db.delete(cartItems).where(eq(cartItems.userId, order.userId));
      }

      console.log(`[PhonePe Callback] Payment verified successfully for order #${order.id}. Redirecting to profile orders.`);
      return NextResponse.redirect(`${baseUrl}/profile/orders?payment=success&orderId=${order.id}`);
    } else {
      // Payment failed or cancelled: Delete unconfirmed pending order record
      // NOTE: Cart items are intentionally NOT deleted, allowing user to retry
      if (order.paymentStatus !== "paid") {
        await db.delete(orderItems).where(eq(orderItems.orderId, order.id));
        await db.delete(orders).where(eq(orders.id, order.id));
        console.log(`[PhonePe Callback] Payment failed/cancelled for order #${order.id} (merchantOrderId: ${merchantOrderId}). Deleted order from DB.`);
      }

      return NextResponse.redirect(`${baseUrl}/cart?error=payment_failed`);
    }
  } catch (error: unknown) {
    console.error("[PhonePe Callback] Error during callback execution:", error);
    return NextResponse.redirect(`${baseUrl}/cart?error=internal_server_error`);
  }
}

export async function GET(req: Request) {
  return handleCallback(req);
}

export async function POST(req: Request) {
  return handleCallback(req);
}

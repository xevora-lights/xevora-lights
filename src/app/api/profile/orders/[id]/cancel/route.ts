import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUser } from "@/db/auth-helper";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getAuthenticatedUser("auth_session");

  if (!user) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }

  try {
    const orderId = parseInt(id, 10);

    if (isNaN(orderId)) {
      return NextResponse.json({ success: false, error: "Invalid order ID" }, { status: 400 });
    }

    let reason = "Cancelled by customer";
    try {
      const body = await req.json();
      if (body?.reason && typeof body.reason === "string" && body.reason.trim()) {
        reason = body.reason.trim();
      }
    } catch {
      // Body empty or not JSON
    }

    // Fetch the order (must belong to this user)
    const orderRows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, user.id)))
      .limit(1);

    if (!orderRows.length) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    const order = orderRows[0];
    const status = (order.status || "").toLowerCase();

    if (status === "cancelled") {
      return NextResponse.json({ success: true, message: "Order is already cancelled" });
    }

    if (status === "shipped" || status === "delivered") {
      return NextResponse.json(
        { success: false, error: `Cannot cancel an order that is already ${order.status}.` },
        { status: 403 }
      );
    }

    await db
      .update(orders)
      .set({
        status: "Cancelled",
        cancellationReason: reason,
        cancelledBy: "customer",
      })
      .where(and(eq(orders.id, orderId), eq(orders.userId, user.id)));

    return NextResponse.json({ success: true, message: "Order cancelled successfully" });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Order Cancellation API Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

export const POST = PATCH;

"use client";

import React, { useEffect, useState, Suspense } from "react";
import {
  ShoppingBag,
  Loader2,
  Package,
  CheckCircle2,
  Clock,
  Ruler,
  XCircle,
  AlertTriangle,
  Image as ImageIcon,
  MapPin,
  Check,
  X,
  Star,
  ArrowLeft,
  Truck,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCartStore } from "@/store/useCartStore";

interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  productImage: string;
  productCategory: string | null;
  variationSku: string | null;
  quantity: number;
  price: number;
  size: string;
  color: string;
  customizations: {
    type: string;
    measurements: Record<string, string>;
  } | null;
}

interface Order {
  id: number;
  totalAmount: number;
  status: string;
  paymentStatus?: string | null;
  shippingAddress: string | null;
  createdAt: string;
  couponCode: string | null;
  discountAmount: number | null;
  couponTargetType: string | null;
  couponTargetValue: string | null;
  items: OrderItem[];
  courierServiceName?: string | null;
  courierId?: string | null;
  trackingNumber?: string | null;
  trackingLink?: string | null;
  estimatedDeliveryDate?: string | null;
  shippingNotes?: string | null;
  cancellationReason?: string | null;
}

const isProductCouponMatch = (
  item: OrderItem,
  couponCode: string | null,
  targetType: string | null,
  targetValue: string | null
) => {
  if (!couponCode || !targetType || !targetValue) return false;
  if (targetType === "all" || targetType === "first_order") return false;

  const targetCriteria = targetValue
    .toLowerCase()
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const prodIdStr = item.productId.toString();
  const prodCategory = (item.productCategory || "").toLowerCase().trim();
  const varSku = (item.variationSku || "").toLowerCase().trim();

  return targetCriteria.some(
    (criterion) =>
      criterion === prodIdStr ||
      prodCategory === criterion ||
      prodCategory.includes(criterion) ||
      varSku === criterion
  );
};

const parseAddress = (addrString: string | null) => {
  if (!addrString) return null;

  const getSubstringBetween = (
    str: string,
    startKey: string,
    endKey: string | null
  ) => {
    const startIndex = str.indexOf(startKey);
    if (startIndex === -1) return "";
    const startValIndex = startIndex + startKey.length;
    if (!endKey) {
      return str.slice(startValIndex).trim();
    }
    const endIndex = str.indexOf(endKey);
    if (endIndex === -1 || endIndex < startValIndex) {
      return str.slice(startValIndex).trim();
    }

    let res = str.slice(startValIndex, endIndex).trim();
    if (res.endsWith(",")) {
      res = res.slice(0, -1).trim();
    }
    return res;
  };

  const hasKeys = [
    "Name:",
    "Street:",
    "City:",
    "State:",
    "Pincode:",
    "Contact:",
  ].every((k) => addrString.includes(k));

  if (hasKeys) {
    return {
      name: getSubstringBetween(addrString, "Name:", "Street:"),
      street: getSubstringBetween(addrString, "Street:", "City:"),
      city: getSubstringBetween(addrString, "City:", "State:"),
      state: getSubstringBetween(addrString, "State:", "Pincode:"),
      pincode: getSubstringBetween(addrString, "Pincode:", "Contact:"),
      contact: getSubstringBetween(addrString, "Contact:", null),
    };
  }

  return null;
};

interface UserReview {
  id: number;
  productId: number;
  orderId: number;
  rating: number;
  title: string;
  comment: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

const MILESTONES = ["Confirmed", "Processing", "Shipped", "Delivered"];

function MyOrdersContent() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [confirmingCancelId, setConfirmingCancelId] = useState<number | null>(
    null
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const searchParams = useSearchParams();

  // Review states
  const [userReviews, setUserReviews] = useState<UserReview[]>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedReviewItem, setSelectedReviewItem] = useState<{
    orderId: number;
    item: OrderItem;
  } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const orderIdParam = searchParams.get("orderId");
  const targetedOrderId = orderIdParam ? parseInt(orderIdParam, 10) : null;

  const fetchUserReviews = async () => {
    try {
      const res = await fetch("/api/reviews/user");
      const data = await res.json();
      if (data.success) {
        setUserReviews(data.data || []);
      }
    } catch (err: unknown) {
      console.error("Failed to fetch user reviews", err);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/profile/orders");
      const data = await res.json();
      if (data.success) {
        setOrders(data.data || []);
      }
    } catch (error: unknown) {
      console.error("Failed to fetch orders", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchUserReviews();
  }, []);

  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    const orderId = searchParams.get("orderId");
    if (paymentStatus === "success") {
      useCartStore.getState().clearCart();
      setSuccessBanner(
        orderId
          ? `Payment successful! Order #XV-ORD-${orderId} confirmed via PhonePe.`
          : "Payment successful! Your order has been placed successfully via PhonePe."
      );
    }
  }, [searchParams]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleCancelOrder = async (orderId: number) => {
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/profile/orders/${orderId}/cancel`, {
        method: "PATCH",
      });
      const data = await res.json();
      if (data.success) {
        showToast("Order cancelled successfully");
        fetchOrders();
      } else {
        showToast(data.error || "Failed to cancel order");
      }
    } catch (error: unknown) {
      console.error("Cancellation error:", error);
      showToast("Something went wrong");
    } finally {
      setIsCancelling(false);
      setConfirmingCancelId(null);
    }
  };

  const handleOpenReviewModal = (orderId: number, item: OrderItem) => {
    setSelectedReviewItem({ orderId, item });
    setReviewError("");

    const existing = userReviews.find(
      (r) => r.orderId === orderId && r.productId === item.productId
    );
    if (existing) {
      setReviewRating(existing.rating || 5);
      setReviewTitle(existing.title || "");
      setReviewComment(existing.comment || "");
    } else {
      setReviewRating(5);
      setReviewTitle("");
      setReviewComment("");
    }
    setIsReviewModalOpen(true);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReviewItem) return;

    if (!reviewTitle.trim() || reviewTitle.trim().length < 3) {
      setReviewError("Please provide a headline of at least 3 characters.");
      return;
    }
    if (!reviewComment.trim() || reviewComment.trim().length < 5) {
      setReviewError("Please provide feedback of at least 5 characters.");
      return;
    }

    setIsSubmittingReview(true);
    setReviewError("");

    try {
      const res = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedReviewItem.orderId,
          productId: selectedReviewItem.item.productId,
          rating: reviewRating,
          title: reviewTitle.trim(),
          comment: reviewComment.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast("Review submitted! Pending approval by admin.");
        setIsReviewModalOpen(false);
        fetchUserReviews();
      } else {
        setReviewError(data.error || "Failed to submit review.");
      }
    } catch {
      setReviewError("An error occurred while submitting review.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
        <p className="text-xs font-mono text-secondary uppercase tracking-widest">
          Retrieving Optical Manifest...
        </p>
      </div>
    );
  }

  // Filter orders if a specific orderId is targeted in URL query
  const displayedOrders =
    targetedOrderId && !isNaN(targetedOrderId)
      ? orders.filter((o) => o.id === targetedOrderId)
      : orders;

  const isSingleOrderView = Boolean(targetedOrderId && !isNaN(targetedOrderId));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-24 text-on-surface">
      {/* ── Success Banner ─────────────────────────────────────────────────── */}
      {successBanner && (
        <div className="mb-8 p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-center justify-between text-emerald-400 animate-in fade-in duration-300">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider">
                Order Confirmed
              </h4>
              <p className="text-xs font-medium text-emerald-300/90 mt-0.5 font-mono">
                {successBanner}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="p-1 hover:bg-emerald-500/20 rounded-lg transition-colors text-emerald-400 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Page Header / Breadcrumbs ──────────────────────────────────────── */}
      {isSingleOrderView ? (
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div className="space-y-1.5">
            <Link
              href="/account?tab=orders"
              className="inline-flex items-center gap-1.5 text-xs text-secondary hover:text-white font-mono transition-colors group mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
              <span>Back to My Orders</span>
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-headline font-bold text-white tracking-tight">
                Order Details
              </h1>
              <span className="font-mono text-xs font-bold text-primary-container bg-primary-container/15 border border-primary-container/30 px-2.5 py-0.5 rounded-lg">
                #XV-ORD-{targetedOrderId}
              </span>
            </div>
            <p className="text-xs text-secondary font-mono">
              Hardware manifest, logistics status, and billing verification
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/account?tab=orders"
              className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-secondary hover:text-white font-mono text-xs transition-colors border border-white/5"
            >
              All Orders
            </Link>
            <Link
              href="/"
              className="p-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-white transition-colors border border-white/5"
              title="Store Home"
            >
              <ShoppingBag className="w-4 h-4" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="mb-10 flex items-center justify-between border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-headline font-bold text-white mb-1.5 tracking-tight">
              My Orders
            </h1>
            <p className="text-secondary text-xs font-mono">
              Track studio hardware dispatches and order archives
            </p>
          </div>
          <Link
            href="/"
            className="p-3 rounded-2xl bg-surface-container text-white hover:bg-surface-container-high transition-all border border-white/5"
          >
            <ShoppingBag size={20} />
          </Link>
        </div>
      )}

      {/* ── Empty or Not Found States ───────────────────────────────────────── */}
      {displayedOrders.length === 0 ? (
        <div className="bg-surface-container rounded-3xl p-16 border border-white/5 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 bg-surface-container-highest rounded-2xl flex items-center justify-center mx-auto mb-5 border border-white/5 text-secondary">
            <Package size={32} />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">
            {isSingleOrderView
              ? `Order #XV-ORD-${targetedOrderId} Not Found`
              : "No Studio Dispatches Found"}
          </h3>
          <p className="text-secondary text-xs font-mono mb-8 leading-relaxed">
            {isSingleOrderView
              ? "This order manifest could not be retrieved or may belong to another session."
              : "You haven't placed any hardware orders yet. Explore our modular spotlights and creator bundles."}
          </p>
          <Link
            href={isSingleOrderView ? "/account?tab=orders" : "/#models"}
            className="inline-flex items-center gap-2 bg-primary-container text-white px-6 py-3 rounded-xl font-mono font-bold text-xs uppercase tracking-wider hover:bg-tertiary-container transition-all shadow-[0_0_24px_rgba(229,26,52,0.4)]"
          >
            {isSingleOrderView ? "← Return to Orders" : "Explore Hardware Catalog"}
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {displayedOrders.map((order) => {
            const statusLower = (order.status || "").toLowerCase();
            const isDelivered = statusLower === "delivered";
            const isCancelled = statusLower === "cancelled";
            const isConfirmed = statusLower === "confirmed";
            const isCancellable =
              statusLower === "pending" ||
              statusLower === "confirmed" ||
              statusLower === "processing" ||
              statusLower === "ready to ship";

            // Price Breakdown Calculations
            const itemsSubtotal = order.items.reduce(
              (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
              0
            );
            const discount = order.discountAmount || 0;
            // Courier fee is ₹199 if applicable, or derived from total + discount - subtotal
            const courierFee =
              order.items.length > 0
                ? Math.max(0, order.totalAmount + discount - itemsSubtotal)
                : 0;

            return (
              <div
                key={order.id}
                className="bg-surface-container rounded-3xl border border-white/5 shadow-2xl overflow-hidden hover:border-white/15 transition-all"
              >
                {/* ── Order Header Bar (Stitch Design) ───────────────────── */}
                <div className="p-5 sm:p-6 bg-surface-container-high/60 flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 gap-4">
                  <div className="flex items-center space-x-3.5">
                    <div className="p-3 bg-surface-container rounded-2xl border border-white/5 text-primary-container shadow-inner">
                      <Package size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[11px] font-bold text-primary-container uppercase tracking-wider">
                          #XV-ORD-{order.id}
                        </span>
                        <span className="text-white/20">•</span>
                        <span className="font-mono text-[11px] text-secondary">
                          {new Date(order.createdAt).toLocaleDateString(
                            "en-IN",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </span>
                      </div>
                      <h4 className="text-base sm:text-lg font-bold text-white tracking-tight">
                        Xevora Lights Order
                      </h4>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Status Pill */}
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${isDelivered
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : isCancelled
                            ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                            : isConfirmed
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                              : "bg-primary-container/20 text-primary border-primary-container/30"
                        }`}
                    >
                      {order.status}
                    </span>

                    {/* Payment Status Pill */}
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${order.paymentStatus === "paid"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                          : "bg-amber-500/15 text-amber-400 border-amber-500/20"
                        }`}
                    >
                      {order.paymentStatus === "paid" ? "PAID" : "PAYMENT PENDING"}
                    </span>

                    {/* Total Pill */}
                    <div className="px-3.5 py-1 rounded-xl bg-surface-container border border-white/5 text-right font-mono">
                      <span className="text-[10px] text-secondary uppercase tracking-wider mr-1.5">
                        Total
                      </span>
                      <span className="text-sm font-bold text-white">
                        ₹{order.totalAmount.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Status Stepper (Active when not cancelled) ─────────── */}
                {!isCancelled && (
                  <div className="px-6 sm:px-12 md:px-20 pt-7 pb-6 border-b border-white/5 bg-surface-container-low/40">
                    {/* Desktop Stepper */}
                    <div className="hidden md:block relative">
                      <div className="absolute top-1/2 left-0 w-full h-[2px] bg-white/5 -translate-y-1/2 rounded-full" />
                      {(() => {
                        const getMilestoneIndex = (status: string) => {
                          const s = status?.toLowerCase() || "";
                          if (s === "confirmed" || s === "pending") return 0;
                          if (s === "processing" || s === "ready to ship")
                            return 1;
                          if (s === "shipped") return 2;
                          if (s === "delivered") return 3;
                          return 0;
                        };
                        const mIndex = getMilestoneIndex(order.status);
                        return (
                          <div
                            className="absolute top-1/2 left-0 h-[2px] bg-primary-container -translate-y-1/2 rounded-full transition-all duration-1000 shadow-[0_0_12px_rgba(229,26,52,0.6)]"
                            style={{
                              width: `${(mIndex / (MILESTONES.length - 1)) * 100}%`,
                            }}
                          />
                        );
                      })()}

                      <div className="relative flex justify-between">
                        {MILESTONES.map((m, idx) => {
                          const getMilestoneIndex = (status: string) => {
                            const s = status?.toLowerCase() || "";
                            if (s === "confirmed" || s === "pending") return 0;
                            if (s === "processing" || s === "ready to ship")
                              return 1;
                            if (s === "shipped") return 2;
                            if (s === "delivered") return 3;
                            return 0;
                          };
                          const mIndex = getMilestoneIndex(order.status);
                          const isCompleted = mIndex >= idx;
                          const isCurrent =
                            order.status?.toLowerCase() === m.toLowerCase();

                          return (
                            <div
                              key={m}
                              className="flex flex-col items-center group/dot"
                            >
                              <div
                                className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-500 z-10 ${isCompleted
                                    ? "bg-primary-container border-primary-container shadow-[0_0_10px_rgba(229,26,52,0.8)] scale-125"
                                    : "bg-surface-container border-white/20"
                                  } ${isCurrent ? "ring-4 ring-primary-container/25 animate-pulse" : ""}`}
                              />
                              <span
                                className={`absolute mt-6 text-[10px] font-mono font-bold uppercase tracking-wider text-center whitespace-nowrap transition-colors duration-300 ${isCompleted ? "text-white" : "text-secondary/50"
                                  }`}
                              >
                                {m}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Mobile Stepper */}
                    <div className="md:hidden grid grid-cols-4 gap-2 text-center pt-1">
                      {MILESTONES.map((m, idx) => {
                        const getMilestoneIndex = (status: string) => {
                          const s = status?.toLowerCase() || "";
                          if (s === "confirmed" || s === "pending") return 0;
                          if (s === "processing" || s === "ready to ship")
                            return 1;
                          if (s === "shipped") return 2;
                          if (s === "delivered") return 3;
                          return 0;
                        };
                        const mIndex = getMilestoneIndex(order.status);
                        const isCompleted = mIndex >= idx;
                        return (
                          <div key={m} className="space-y-1.5">
                            <div
                              className={`h-1.5 rounded-full ${isCompleted
                                  ? "bg-primary-container shadow-[0_0_8px_rgba(229,26,52,0.6)]"
                                  : "bg-white/10"
                                }`}
                            />
                            <p
                              className={`text-[9px] font-mono uppercase tracking-wider font-bold ${isCompleted ? "text-white" : "text-secondary/50"
                                }`}
                            >
                              {m}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Order Body (Manifest & Coordinates) ────────────────── */}
                <div className="p-5 sm:p-8">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Column: Items Manifest & Detailed Pricing Breakdown */}
                    <div className="lg:col-span-7 space-y-6">
                      <div className="flex items-center justify-between pb-2 border-b border-white/5">
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-white/50">
                          Hardware Manifest ({order.items.reduce((s, i) => s + (i.quantity || 1), 0)} Units)
                        </span>
                      </div>

                      {/* Item Rows */}
                      <div className="space-y-4">
                        {order.items.map((item) => {
                          const isBespoke =
                            item.customizations &&
                            item.customizations.measurements &&
                            Object.keys(item.customizations.measurements).length >
                            0;
                          const isProductCoupon = isProductCouponMatch(
                            item,
                            order.couponCode,
                            order.couponTargetType,
                            order.couponTargetValue
                          );
                          const itemReview = userReviews.find(
                            (r) =>
                              r.orderId === order.id &&
                              r.productId === item.productId
                          );

                          return (
                            <div
                              key={item.id}
                              className="p-4 rounded-2xl bg-surface-container-high/40 border border-white/5 flex flex-col sm:flex-row gap-4 sm:items-center justify-between"
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                <div className="w-16 h-16 rounded-xl bg-surface-container-highest shrink-0 overflow-hidden relative border border-white/5">
                                  {item.productImage ? (
                                    <img
                                      src={item.productImage}
                                      alt={item.productName}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src =
                                          "/images/product/hero-main.jpg";
                                      }}
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/20">
                                      <ImageIcon size={20} />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <h5 className="text-sm font-bold text-white truncate">
                                    {item.productName}
                                  </h5>
                                  <p className="text-xs text-secondary font-mono mt-0.5">
                                    {item.size || "Standard Kit"} • Qty:{" "}
                                    {item.quantity}
                                  </p>

                                  {isBespoke && (
                                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-primary mt-1">
                                      <Ruler size={11} />
                                      <span>Custom Measurements Specified</span>
                                    </div>
                                  )}

                                  {isProductCoupon && (
                                    <span className="inline-block mt-1 font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                      Voucher Claimed: {order.couponCode}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="text-right sm:self-center shrink-0">
                                <p className="font-mono text-xs text-secondary">
                                  ₹{item.price.toLocaleString("en-IN")} × {item.quantity}
                                </p>
                                <p className="font-mono text-sm font-bold text-white mt-0.5">
                                  ₹{(item.price * item.quantity).toLocaleString(
                                    "en-IN"
                                  )}
                                </p>

                                {isDelivered && (
                                  <div className="mt-2">
                                    {itemReview ? (
                                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 justify-end">
                                        <CheckCircle2 size={11} /> Verified Review (★{itemReview.rating})
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenReviewModal(order.id, item)
                                        }
                                        className="text-[10px] font-mono text-primary-container hover:underline cursor-pointer"
                                      >
                                        Write Review →
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* ── Price Breakdown Box (Same as Cart / Checkout) ─── */}
                      <div className="p-4 sm:p-5 rounded-2xl bg-surface-container-high/60 border border-white/5 space-y-3 font-mono text-xs">
                        <div className="flex items-center justify-between pb-2 border-b border-white/5 text-[11px] font-bold text-white/50 uppercase tracking-wider">
                          <span>Billing &amp; Price Breakdown</span>
                          <span>INR (₹)</span>
                        </div>

                        {/* Hardware Subtotal */}
                        <div className="flex justify-between items-center text-secondary">
                          <span>
                            Hardware Subtotal ({order.items.reduce((s, i) => s + (i.quantity || 1), 0)} Units)
                          </span>
                          <span className="text-white font-semibold">
                            ₹{itemsSubtotal.toLocaleString("en-IN")}
                          </span>
                        </div>

                        {/* Domestic Express Courier */}
                        <div className="flex justify-between items-center text-secondary">
                          <span>Domestic Express Courier</span>
                          <span className="text-white font-semibold">
                            {courierFee > 0
                              ? `₹${courierFee.toLocaleString("en-IN")}`
                              : "Free"}
                          </span>
                        </div>

                        {/* Studio Voucher Discount */}
                        {discount > 0 && (
                          <div className="flex justify-between items-center text-emerald-400 font-semibold bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                            <span>
                              Studio Voucher ({order.couponCode || "COUPON"})
                            </span>
                            <span>-₹{discount.toLocaleString("en-IN")}</span>
                          </div>
                        )}

                        {/* Payable / Paid Grand Total */}
                        <div className="border-t border-white/10 pt-2.5 flex justify-between items-center text-sm font-bold text-white">
                          <span>Paid Grand Total</span>
                          <span className="text-primary text-base font-extrabold font-mono">
                            ₹{order.totalAmount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Destination Coordinates, Courier & Manage Order */}
                    <div className="lg:col-span-5 space-y-6 lg:border-l border-white/5 lg:pl-8">
                      {/* Destination Address Card */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-secondary">
                          <MapPin size={13} className="text-primary-container" />
                          <span>Destination Coordinates</span>
                        </div>
                        <div className="p-4 rounded-2xl bg-surface-container-high/40 border border-white/5 font-mono text-xs text-secondary leading-relaxed">
                          {(() => {
                            const parsed = parseAddress(order.shippingAddress);
                            if (parsed) {
                              return (
                                <div className="space-y-1.5">
                                  <p className="text-white font-bold">
                                    {parsed.name}
                                  </p>
                                  <p>{parsed.street}</p>
                                  <p>
                                    {parsed.city}, {parsed.state} - {parsed.pincode}
                                  </p>
                                  <p className="text-white/60 pt-1 border-t border-white/5">
                                    Contact: {parsed.contact}
                                  </p>
                                </div>
                              );
                            }
                            return (
                              <p className="font-sans text-xs text-white/80">
                                {order.shippingAddress ||
                                  "Standard Delivery Address"}
                              </p>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Logistics & Tracking (if shipped/delivered) */}
                      {["shipped", "delivered"].includes(statusLower) && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-primary">
                            <Truck size={13} />
                            <span>Logistics &amp; Tracking</span>
                          </div>
                          <div className="p-4 rounded-2xl bg-surface-container-high/40 border border-white/5 space-y-2 font-mono text-xs text-secondary">
                            {order.courierServiceName && (
                              <div className="flex justify-between">
                                <span>Courier Partner</span>
                                <span className="text-white font-bold">
                                  {order.courierServiceName}
                                </span>
                              </div>
                            )}
                            {order.trackingNumber && (
                              <div className="flex justify-between">
                                <span>Waybill / Tracking</span>
                                <span className="text-white font-bold">
                                  {order.trackingNumber}
                                </span>
                              </div>
                            )}
                            {order.trackingLink && (
                              <div className="pt-2 border-t border-white/5">
                                <a
                                  href={order.trackingLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary-container hover:underline font-bold flex items-center gap-1.5"
                                >
                                  <span>Track Live Shipment Progress</span>
                                  <ExternalLink size={12} />
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Manage Order / Cancellation Card */}
                      <div className="space-y-2 pt-2">
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-secondary">
                          Manage Hardware Order
                        </span>

                        <div className="p-4 rounded-2xl bg-surface-container-high/40 border border-white/5">
                          {isCancellable ? (
                            confirmingCancelId === order.id ? (
                              <div className="space-y-3">
                                <p className="text-xs font-mono text-rose-400 font-semibold leading-relaxed">
                                  Confirm cancellation? This will cancel the order and release allocated inventory.
                                </p>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isCancelling}
                                    onClick={() => handleCancelOrder(order.id)}
                                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-mono font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                  >
                                    {isCancelling ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      <Check size={12} />
                                    )}
                                    <span>Yes, Cancel</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isCancelling}
                                    onClick={() => setConfirmingCancelId(null)}
                                    className="flex-1 py-2.5 bg-surface-container hover:bg-surface-container-high text-secondary hover:text-white font-mono font-bold rounded-xl transition-all text-xs border border-white/10 cursor-pointer"
                                  >
                                    No, Keep
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmingCancelId(order.id)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-all font-mono font-semibold text-xs cursor-pointer"
                              >
                                <XCircle size={14} />
                                <span>Cancel Order</span>
                              </button>
                            )
                          ) : isCancelled ? (
                            <div className="flex items-start gap-2.5 text-rose-400 text-xs font-mono">
                              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                              <p>
                                Order Cancelled. If payment was captured, refund is processed within 5-7 working days.
                              </p>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono">
                              <ShieldCheck size={15} className="shrink-0" />
                              <span>Order is fulfilled and in transit.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Verified Review Submission Modal ── */}
      {isReviewModalOpen && selectedReviewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
          onClick={() => setIsReviewModalOpen(false)}
        >
          <div
            className="relative w-full max-w-lg bg-surface-container border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl text-white space-y-6 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-primary-container/15 border border-primary-container/30 text-primary">
                  <Star className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    Verified Buyer Review
                  </h3>
                  <p className="text-xs text-secondary font-mono">
                    Share hands-on feedback on this optical kit.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-secondary hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-container-high border border-white/10">
              <div className="w-12 h-12 rounded-xl bg-black overflow-hidden shrink-0 border border-white/10">
                {selectedReviewItem.item.productImage ? (
                  <img
                    src={selectedReviewItem.item.productImage}
                    alt={selectedReviewItem.item.productName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30">
                    <ImageIcon size={18} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white truncate">
                  {selectedReviewItem.item.productName}
                </h4>
                <p className="text-[10px] text-secondary font-mono mt-0.5">
                  Order #{selectedReviewItem.orderId} •{" "}
                  {selectedReviewItem.item.size}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-5">
              <div>
                <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-secondary mb-2">
                  Rating
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="p-1 text-white hover:scale-110 transition-transform cursor-pointer"
                    >
                      <Star
                        className={`w-7 h-7 transition-colors ${star <= reviewRating
                            ? "fill-amber-400 text-amber-400"
                            : "text-white/20 hover:text-white/40"
                          }`}
                      />
                    </button>
                  ))}
                  <span className="font-mono text-xs font-semibold text-amber-400 ml-2">
                    {reviewRating === 5 && "5 / 5 (Exceptional)"}
                    {reviewRating === 4 && "4 / 5 (Very Good)"}
                    {reviewRating === 3 && "3 / 5 (Good / Average)"}
                    {reviewRating === 2 && "2 / 5 (Needs Improvement)"}
                    {reviewRating === 1 && "1 / 5 (Poor)"}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Review Headline *
                </label>
                <input
                  type="text"
                  required
                  value={reviewTitle}
                  onChange={(e) => setReviewTitle(e.target.value)}
                  placeholder="e.g. Optical sharpness exceeds expectations in studio"
                  className="w-full bg-surface-container-high border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-primary-container transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Detailed Feedback *
                </label>
                <textarea
                  required
                  rows={4}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Describe your hands-on experience with optical precision, cooling fan noise, GOBO stencils, or overall build..."
                  className="w-full bg-surface-container-high border border-white/10 rounded-xl p-4 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-primary-container transition-colors resize-none leading-relaxed font-mono"
                />
              </div>

              {reviewError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-2 font-mono">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{reviewError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-surface-container-high hover:bg-white/10 text-secondary hover:text-white text-xs font-mono font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="px-5 py-2.5 rounded-xl bg-primary-container hover:bg-tertiary-container text-white text-xs font-mono font-bold uppercase tracking-wider shadow-lg shadow-primary-container/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingReview ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Submit Review</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast Notification ────────────────────────────────────────────── */}
      {toastMsg && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-surface-container border border-primary-container/30 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center space-x-3 font-mono font-bold text-xs animate-in fade-in slide-in-from-bottom-5 duration-300">
          <CheckCircle2 size={16} className="text-primary-container" />
          <span className="uppercase tracking-widest">{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

export default function MyOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex flex-col items-center justify-center bg-background">
          <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
          <p className="text-xs font-mono text-secondary uppercase tracking-widest">
            Loading...
          </p>
        </div>
      }
    >
      <MyOrdersContent />
    </Suspense>
  );
}

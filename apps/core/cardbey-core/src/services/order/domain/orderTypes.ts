import type { OrderActorContext } from './orderRoles';
import type { OrderChannel, OrderCancelRequestStatus, OrderStatus } from './orderStatus';

export interface OrderItemSnapshot {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  titleSnapshot: string;
  imageSnapshot: string | null;
  priceSnapshot: number;
  quantity: number;
  lineTotalAmount: number;
  metadataSnapshot: Record<string, unknown>;
}

export interface OrderCancelRequest {
  id: string;
  orderId: string;
  requestedByUserId: string;
  reason: string;
  status: OrderCancelRequestStatus;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface OrderStatusEvent {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorId: string;
  actorType: OrderActorContext['actorType'];
  actorRole: OrderActorContext['actorRole'];
  source: OrderActorContext['source'];
  reason: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  buyerUserId: string;
  sellerUserId: string | null;
  sellerStoreId: string | null;
  channel: OrderChannel;
  status: OrderStatus;
  currency: string;
  subtotalAmount: number;
  discountAmount: number;
  deliveryFeeAmount: number;
  totalAmount: number;
  customerNote: string | null;
  createdAt: string;
  updatedAt: string;
}


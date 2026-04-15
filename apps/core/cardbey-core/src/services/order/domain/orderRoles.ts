export const ORDER_ACTOR_TYPES = ['user', 'agent', 'system'] as const;
export type OrderActorType = (typeof ORDER_ACTOR_TYPES)[number];

export const ORDER_ACTOR_ROLES = ['buyer', 'seller', 'operator'] as const;
export type OrderActorRole = (typeof ORDER_ACTOR_ROLES)[number];

export const ORDER_SOURCES = ['ui', 'automation', 'api', 'webhook'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export interface OrderActorContext {
  actorId: string;
  actorType: OrderActorType;
  actorRole: OrderActorRole;
  source: OrderSource;
  reason?: string | null;
}


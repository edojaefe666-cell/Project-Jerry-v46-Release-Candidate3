import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  index,
  jsonb,
  pgTable,
  serial,
  uniqueIndex,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const workspaces = pgTable('workspaces', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull()
    .unique(),
  stateJson: jsonb('state_json').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const ledgerTransactions = pgTable('ledger_transactions', {

  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  txRef: text('tx_ref').notNull(),
  timestamp: text('timestamp').notNull(),
  txType: text('tx_type').notNull(),
  asset: text('asset').notNull(),
  network: text('network').notNull(),
  amount: doublePrecision('amount').notNull(),
  usdValue: doublePrecision('usd_value'),
  usdValuationAt: text('usd_valuation_at'),
  usdValuationSource: text('usd_valuation_source'),
  fee: doublePrecision('fee').notNull(),
  counterparty: text('counterparty').notNull(),
  status: text('status').notNull(),
  note: text('note').notNull(),
  txHash: text('tx_hash'),
  isVerifiedOnChain: boolean('is_verified_on_chain').default(false),
  confirmationDepth: integer('confirmation_depth'),
  verifiedBlockHeight: integer('verified_block_height'),
  verifiedBlockHash: text('verified_block_hash'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userTxRefUnique: uniqueIndex('ledger_transactions_user_tx_ref_unique').on(table.userId, table.txRef),
}));


export const idempotencyKeys = pgTable('idempotency_keys', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  key: text('key').notNull(),
  command: text('command').notNull(),
  responseJson: jsonb('response_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userKeyUnique: uniqueIndex('idempotency_keys_user_key_unique').on(table.userId, table.key),
}));

export const taskExecutions = pgTable('task_executions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  executionId: text('execution_id').notNull().unique(),
  taskId: text('task_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull(),
  checkpoint: text('checkpoint').notNull(),
  resultJson: jsonb('result_json'),
  startedAt: timestamp('started_at').notNull(),
  completedAt: timestamp('completed_at'),
  updatedAt: timestamp('updated_at').notNull(),
}, (table) => ({
  userTaskIdempotencyUnique: uniqueIndex('task_executions_user_task_idempotency_unique')
    .on(table.userId, table.taskId, table.idempotencyKey),
}));

export const dailySummaryReports = pgTable('daily_summary_reports', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  reportDate: text('report_date').notNull(),
  headline: text('headline').notNull(),
  summaryText: text('summary_text').notNull(),
  dailyProfitUsd: doublePrecision('daily_profit_usd'),
  activeTasksCount: integer('active_tasks_count').notNull(),
  insightsCount: integer('insights_count').notNull(),
  chartDataJson: jsonb('chart_data_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});


export const storageObjects = pgTable('storage_objects', {
  id: text('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  objectKey: text('object_key').notNull().unique(),
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ownerCreatedIndex: index('storage_objects_user_created_idx').on(table.userId, table.createdAt),
}));

export const memoryEntries = pgTable('memory_entries', {
  id: text('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  category: text('category').notNull(),
  memoryArea: text('memory_area').notNull().default('knowledge_experience'),
  title: text('title').notNull(),
  content: text('content').notNull(),
  outcome: text('outcome'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memoryEntriesRelations = relations(memoryEntries, ({ one }) => ({
  owner: one(users, { fields: [memoryEntries.userId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [users.id],
    references: [workspaces.userId],
  }),
  transactions: many(ledgerTransactions),
  dailySummaries: many(dailySummaryReports),
  idempotencyKeys: many(idempotencyKeys),
  taskExecutions: many(taskExecutions),
  memoryEntries: many(memoryEntries),
  storageObjects: many(storageObjects),
}));

export const workspacesRelations = relations(workspaces, ({ one }) => ({
  owner: one(users, {
    fields: [workspaces.userId],
    references: [users.id],
  }),
}));

export const idempotencyKeysRelations = relations(idempotencyKeys, ({ one }) => ({
  owner: one(users, { fields: [idempotencyKeys.userId], references: [users.id] }),
}));

export const taskExecutionsRelations = relations(taskExecutions, ({ one }) => ({
  owner: one(users, { fields: [taskExecutions.userId], references: [users.id] }),
}));

export const ledgerTransactionsRelations = relations(ledgerTransactions, ({ one }) => ({
  owner: one(users, {
    fields: [ledgerTransactions.userId],
    references: [users.id],
  }),
}));

export const dailySummaryReportsRelations = relations(dailySummaryReports, ({ one }) => ({
  owner: one(users, {
    fields: [dailySummaryReports.userId],
    references: [users.id],
  }),
}));

export const storageObjectsRelations = relations(storageObjects, ({ one }) => ({
  owner: one(users, { fields: [storageObjects.userId], references: [users.id] }),
}));

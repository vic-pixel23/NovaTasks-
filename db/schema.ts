import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, check, uniqueIndex, index } from 'drizzle-orm/pg-core';
const date = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
export const users = pgTable('users', {
 id: uuid('id').primaryKey(), fullName: text('full_name').notNull(), email: text('email').notNull().unique(),
 registeredAt: date('registered_at'), status: text('status').notNull().default('active'), role: text('role').notNull().default('member'),
}, t => [check('user_status', sql`${t.status} in ('active','suspended')`), check('user_role', sql`${t.role} in ('member','admin')`)]);
export const tasks = pgTable('tasks', {
 id: uuid('id').primaryKey().defaultRandom(), title: text('title').notNull(), description: text('description').notNull(), kind: text('kind').notNull(),
 rewardKobo: integer('reward_kobo').notNull(), slots: integer('slots').notNull(), status: text('status').notNull().default('published'), createdAt: date('created_at'),
}, t => [check('task_money', sql`${t.rewardKobo} > 0`), check('task_slots', sql`${t.slots} >= 0`), check('task_kind', sql`${t.kind} in ('task','survey')`), check('task_status', sql`${t.status} in ('published','paused','closed')`)]);
export const submissions = pgTable('submissions', {
 id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(() => users.id), taskId: uuid('task_id').notNull().references(() => tasks.id),
 proof: text('proof').notNull(), rewardKobo: integer('reward_kobo').notNull(), status: text('status').notNull().default('pending'), createdAt: date('created_at'), reviewedAt: timestamp('reviewed_at', {withTimezone:true}), reviewerId: uuid('reviewer_id').references(() => users.id),
}, t => [uniqueIndex('one_submission_per_user_task').on(t.userId,t.taskId), check('submission_status', sql`${t.status} in ('pending','approved','rejected')`)]);
export const withdrawals = pgTable('withdrawals', {
 id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(() => users.id), amountKobo: integer('amount_kobo').notNull(), paymentDetails: text('payment_details').notNull(), status: text('status').notNull().default('pending'), requestedAt: date('requested_at'), reviewedAt: timestamp('reviewed_at',{withTimezone:true}), reviewerId: uuid('reviewer_id').references(() => users.id), paymentReference: text('payment_reference').unique(), requestKey: uuid('request_key').notNull(),
}, t => [check('withdrawal_amount',sql`${t.amountKobo} > 0`), check('withdrawal_status',sql`${t.status} in ('pending','approved','paid','rejected')`),uniqueIndex('withdrawal_idempotency').on(t.userId,t.requestKey)]);
export const rewards = pgTable('rewards', {
 id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(() => users.id), amountKobo: integer('amount_kobo').notNull(), type: text('type').notNull().default('task_reward'), status: text('status').notNull().default('posted'), transactionAt: date('transaction_at'), submissionId: uuid('submission_id').notNull().unique().references(() => submissions.id),
}, t => [check('reward_amount',sql`${t.amountKobo} > 0`),check('reward_type',sql`${t.type} = 'task_reward'`),check('reward_status',sql`${t.status} = 'posted'`),index('rewards_user').on(t.userId)]);
export const auditLogs = pgTable('audit_logs', {id:uuid('id').primaryKey().defaultRandom(),actorId:uuid('actor_id').notNull().references(()=>users.id),action:text('action').notNull(),recordId:uuid('record_id').notNull(),createdAt:date('created_at')});

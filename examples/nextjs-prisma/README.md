# Next.js App Router + Prisma (SQLite)

Next.js route handlers are `(req: Request) => Response`, so you can pass `POST` straight to crash-lab without running a server.

`app/api/webhooks/stripe/route.ts`:

```ts
import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      raw,
      req.headers.get('stripe-signature') ?? '',
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return new Response('bad signature', { status: 400 });
  }
  if (event.type === 'checkout.session.completed') {
    const userId = (event.data.object as Stripe.Checkout.Session).metadata?.userId as string;
    try {
      // The unique eventId on the ledger is the atomic claim: a duplicate throws P2002.
      await prisma.$transaction([
        prisma.creditLedger.create({ data: { eventId: event.id, userId, delta: 100 } }),
        prisma.user.update({ where: { id: userId }, data: { credits: { increment: 100 } } }),
      ]);
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
  }
  return new Response('ok');
}
```

`prisma/schema.prisma` (SQLite):

```prisma
datasource db { provider = "sqlite"; url = "file:./test.db" }
generator client { provider = "prisma-client-js" }
model User { id String @id; credits Int @default(0) }
model CreditLedger { id Int @id @default(autoincrement()); eventId String @unique; userId String; delta Int }
```

`test/webhook.crash.test.ts`:

```ts
import { assertNoCrashes, runCrashLab } from 'webhook-crash-lab';
import { POST } from '@/app/api/webhooks/stripe/route';
import { prisma } from '@/lib/prisma';

process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

it('stripe webhook is idempotent', async () => {
  const result = await runCrashLab({
    target: POST,
    secret: 'whsec_test_secret',
    event: {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', metadata: { userId: 'u1' } } },
    },
    adapter: {
      reset: async () => {
        await prisma.creditLedger.deleteMany();
        await prisma.user.upsert({
          where: { id: 'u1' },
          create: { id: 'u1' },
          update: { credits: 0 },
        });
      },
      observe: async () => ({
        credits: (await prisma.user.findUniqueOrThrow({ where: { id: 'u1' } })).credits,
        ledgerEntries: await prisma.creditLedger.count(),
      }),
    },
    expect: { once: { credits: 100, ledgerEntries: 1 } },
  });
  assertNoCrashes(result);
});
```

Remove the `try/catch` around the transaction, or the `@unique` on `eventId`, and `duplicate-concurrent` fails with `credits: expected 100, got 500`.

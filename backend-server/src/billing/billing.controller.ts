import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  BillingPlansResponse,
  BillingPortalResponse,
  BillingSubscriptionResponse,
  BillingWebhookResponse,
  CheckoutRequest,
  CheckoutResponse,
} from "@sda/contracts";
import { CheckoutRequestSchema } from "@sda/contracts";
import type { Request } from "express";
import { AuthGuard } from "../common/access/auth.guard.js";
import {
  requireUser,
  type AuthRequest,
} from "../common/access/auth-context.service.js";
import { readHeader } from "../common/http/headers.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import type { RawBodyRequest } from "../bootstrap.js";
import { BillingService } from "./billing.service.js";

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("plans")
  plans(): BillingPlansResponse {
    return this.billing.plans();
  }

  @Get("subscription")
  @UseGuards(AuthGuard)
  subscription(
    @Req() request: AuthRequest,
  ): Promise<BillingSubscriptionResponse> {
    return this.billing.subscription(requireUser(request));
  }

  @Post("checkout")
  @HttpCode(201)
  @UseGuards(AuthGuard)
  checkout(
    @Req() request: AuthRequest,
    @Body(new ZodValidationPipe(CheckoutRequestSchema))
    body: CheckoutRequest,
  ): Promise<CheckoutResponse> {
    return this.billing.checkout(requireUser(request), body.plan);
  }

  @Post("checkout/:id/complete")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  completeCheckout(
    @Req() request: AuthRequest,
    @Param("id") checkoutId: string,
  ): Promise<BillingSubscriptionResponse> {
    return this.billing.completeCheckout(requireUser(request), checkoutId);
  }

  @Post("portal")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  portal(@Req() request: AuthRequest): Promise<BillingPortalResponse> {
    return this.billing.portal(requireUser(request));
  }

  @Post("cancel")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  cancel(
    @Req() request: AuthRequest,
  ): Promise<BillingSubscriptionResponse> {
    return this.billing.cancel(requireUser(request));
  }

  /** Stripe signs the raw body; the global JSON parser keeps a copy. */
  @Post("webhook")
  @HttpCode(200)
  webhook(@Req() request: RawBodyRequest): Promise<BillingWebhookResponse> {
    return this.billing.webhook(
      request.rawBody?.toString("utf8") ?? "",
      readHeader(request as Request, "stripe-signature"),
    );
  }
}

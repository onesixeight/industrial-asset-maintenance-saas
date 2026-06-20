"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import { changePasswordRequestSchema } from "@iam/shared";
import type { ChangePasswordRequest } from "@iam/shared";
import { changePasswordApi } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/auth/store";
import { Button } from "@/components/button";
import { FormField } from "@/components/form-field";

// useSearchParams() must be inside a Suspense boundary during static prerender.
export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <ChangePasswordForm />
    </Suspense>
  );
}

function ChangePasswordForm() {
  const router = useRouter();
  const search = useSearchParams();
  const email = search.get("email") ?? "";
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ChangePasswordRequest>({
    resolver: zodResolver(changePasswordRequestSchema),
    defaultValues: { email, currentPassword: "", newPassword: "" },
  });

  async function onSubmit(values: ChangePasswordRequest) {
    setServerError(null);
    try {
      const res = await changePasswordApi(values);
      setAuth(res.user, res.accessToken);
      router.push("/dashboard");
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) setServerError("Current password is incorrect.");
      else if (status === 400) setServerError("New password does not meet the policy.");
      else setServerError("Something went wrong. Please try again.");
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Change your password</h1>
        <p className="text-sm text-muted-foreground">
          Your account was created with a temporary password. Set a new one to continue.
        </p>
      </div>
      <FormField
        id="email"
        label="Email"
        type="email"
        error={form.formState.errors.email?.message}
        {...form.register("email")}
      />
      <FormField
        id="currentPassword"
        label="Current (temporary) password"
        type="password"
        error={form.formState.errors.currentPassword?.message}
        {...form.register("currentPassword")}
      />
      <FormField
        id="newPassword"
        label="New password"
        type="password"
        error={form.formState.errors.newPassword?.message}
        {...form.register("newPassword")}
      />
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        Set new password
      </Button>
    </form>
  );
}

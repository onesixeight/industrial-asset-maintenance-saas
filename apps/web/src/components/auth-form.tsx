"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import type { LoginRequest, RegisterRequest } from "@iam/shared";
import { loginRequestSchema, registerRequestSchema } from "@iam/shared";
import { useLogin, useRegister } from "@/lib/auth/hooks";
import { Button } from "./button";
import { FormField } from "./form-field";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const login = useLogin();
  const register = useRegister();
  const [serverError, setServerError] = useState<string | null>(null);

  const isRegister = mode === "register";
  const schema = isRegister ? registerRequestSchema : loginRequestSchema;

  const form = useForm<RegisterRequest | LoginRequest>({
    resolver: zodResolver(schema as never),
    defaultValues: isRegister
      ? { company: "", email: "", password: "", firstName: "", lastName: "" }
      : { email: "", password: "" },
  });

  // errors is a union over both input shapes; index it loosely for the
  // register-only fields (company/firstName/lastName) that don't exist on LoginRequest.
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;
  const errMsg = (k: string): string | undefined => errors[k]?.message;

  async function onSubmit(values: RegisterRequest | LoginRequest) {
    setServerError(null);
    try {
      if (isRegister) await register.mutateAsync(values as RegisterRequest);
      else await login.mutateAsync(values as LoginRequest);
      router.push("/dashboard");
    } catch (e) {
      const err = e as { status?: number; code?: string };
      // Force-change gate: a 403 carrying MUST_CHANGE_PASSWORD routes the user
      // to the change-password page (prefilled email) rather than a generic 403.
      if (!isRegister && err.status === 403 && err.code === "MUST_CHANGE_PASSWORD") {
        const email = (values as LoginRequest).email;
        router.push(`/change-password?email=${encodeURIComponent(email)}`);
        return;
      }
      if (err.status === 401) setServerError("Invalid email or password.");
      else if (err.status === 403) setServerError("You don't have permission to log in here.");
      else if (err.status === 409) setServerError("Email already registered.");
      else setServerError("Something went wrong. Please try again.");
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {isRegister ? (
        <FormField
          id="company"
          label="Company name"
          error={errMsg("company")}
          {...form.register("company" as never)}
        />
      ) : null}
      <FormField
        id="email"
        label="Email"
        type="email"
        error={errMsg("email")}
        {...form.register("email")}
      />
      {isRegister ? (
        <>
          <FormField
            id="firstName"
            label="First name"
            error={errMsg("firstName")}
            {...form.register("firstName" as never)}
          />
          <FormField
            id="lastName"
            label="Last name"
            error={errMsg("lastName")}
            {...form.register("lastName" as never)}
          />
        </>
      ) : null}
      <FormField
        id="password"
        label="Password"
        type="password"
        error={errMsg("password")}
        {...form.register("password")}
      />
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {isRegister ? "Create account" : "Log in"}
      </Button>
    </form>
  );
}

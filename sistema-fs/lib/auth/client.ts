"use client";
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { ac, roles } from "./roles";
export const authClient = createAuthClient({ plugins: [adminClient({ ac, roles })] });

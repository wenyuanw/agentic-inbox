// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import { queryKeys } from "./keys";

export function useSetupStatus() {
	return useQuery({
		queryKey: queryKeys.setup.status,
		queryFn: () => api.getSetupStatus(),
	});
}

export function useValidateSetup() {
	return useMutation({
		mutationFn: (params: { cloudflareToken: string; resendApiKey: string; domain?: string }) =>
			api.validateSetup(params),
	});
}

export function useRunSetup() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (params: { cloudflareToken: string; resendApiKey: string; domain: string; reconfigure?: boolean }) =>
			api.runSetup(params),
		onSuccess: result => {
			if (result.success) {
				void client.invalidateQueries({ queryKey: queryKeys.setup.status });
				void client.invalidateQueries({ queryKey: queryKeys.config });
			}
		},
	});
}

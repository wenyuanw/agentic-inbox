import { useQuery } from "@tanstack/react-query";
import api from "~/services/api";
import type { Email } from "~/types";

export interface UnconfiguredEmailListResponse {
	emails: Email[];
	totalCount: number;
}

export function useUnconfiguredEmails(page: number, limit: number) {
	return useQuery<UnconfiguredEmailListResponse>({
		queryKey: ["unconfigured-emails", page, limit],
		queryFn: ({ signal }) =>
			api.listUnconfiguredEmails(
				{ page: String(page), limit: String(limit) },
				{ signal },
			) as Promise<UnconfiguredEmailListResponse>,
		refetchInterval: 30_000,
	});
}

export function useUnconfiguredEmail(emailId: string | null) {
	return useQuery<Email>({
		queryKey: emailId
			? ["unconfigured-email", emailId]
			: ["unconfigured-email", "_disabled"],
		queryFn: ({ signal }) => api.getUnconfiguredEmail(emailId!, { signal }),
		enabled: !!emailId,
	});
}

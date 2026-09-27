// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useI18n } from "~/hooks/useI18n";

interface EmailPanelHeaderProps {
	subject: string;
	messageCount: number;
	showThreadCount: boolean;
}

export default function EmailPanelHeader({
	subject,
	messageCount,
	showThreadCount,
}: EmailPanelHeaderProps) {
	const { t } = useI18n();
	return (
		<div className="mail-reader-subject">
			<h2 className="mail-reader-heading">{subject}</h2>
			{showThreadCount && (
				<span className="text-xs text-kumo-subtle mt-0.5 block">
					{t("{count} messages in this thread", { count: messageCount })}
				</span>
			)}
		</div>
	);
}

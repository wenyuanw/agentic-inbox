// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useI18n } from "~/hooks/useI18n";
import EmailAttachmentList from "~/components/EmailAttachmentList";
import EmailIframe from "~/components/EmailIframe";
import { formatDetailDate, rewriteInlineImages } from "~/lib/utils";
import type { Email } from "~/types";

interface SingleMessageViewProps {
	email: Email;
	mailboxId?: string;
	onPreviewImage: (url: string, filename: string) => void;
}

export default function SingleMessageView({
	email,
	mailboxId,
	onPreviewImage,
}: SingleMessageViewProps) {
	const { t, localeTag } = useI18n();

	return (
		<div className="mail-single-message">
			<div className="mail-message-meta">
				<div className="mail-message-sender-line">
					<div className="flex items-center gap-2.5 min-w-0">
						<div className="mail-message-avatar">
							{email.sender.charAt(0).toUpperCase()}
						</div>
						<div className="min-w-0">
							<div className="mail-message-sender">{email.sender}</div>
							<div className="text-xs text-kumo-subtle">
								{t("To:")} {email.recipient}
							</div>
						</div>
					</div>
					<span className="mail-message-date">
						{formatDetailDate(email.date, localeTag)}
					</span>
				</div>
			</div>

			<div className="mail-message-body">
				<EmailIframe
					autoSize
					body={rewriteInlineImages(
						email.body || "",
						mailboxId || "",
						email.id,
						email.attachments,
					)}
				/>
			</div>

			<EmailAttachmentList
				mailboxId={mailboxId}
				emailId={email.id}
				attachments={email.attachments}
				onPreviewImage={onPreviewImage}
				className="mail-message-attachments"
				showHeading
			/>
		</div>
	);
}

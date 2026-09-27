import type { ReactNode } from "react";
import EmailPanel from "~/components/EmailPanel";

interface Props {
	selectedEmailId: string | null;
	isComposing?: boolean;
	children: ReactNode;
}

export default function MailboxSplitView({ selectedEmailId, children }: Props) {
	return (
		<div className="mail-view">
			<div className={`mail-list-view ${selectedEmailId ? "is-hidden" : ""}`}>
				{children}
			</div>
			{selectedEmailId && (
				<div className="mail-reader-view" key={selectedEmailId}>
					<EmailPanel emailId={selectedEmailId} />
				</div>
			)}
		</div>
	);
}

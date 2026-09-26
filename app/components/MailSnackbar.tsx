import { XIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { useUIStore } from "~/hooks/useUIStore";

export default function MailSnackbar() {
	const { notice, clearNotice } = useUIStore();
	useEffect(() => {
		if (!notice) return;
		const timeout = window.setTimeout(clearNotice, 8000);
		return () => window.clearTimeout(timeout);
	}, [notice, clearNotice]);
	if (!notice) return null;
	return (
		<div className="mail-snackbar" role="status">
			<span>{notice.message}</span>
			{notice.action && (
				<button
					type="button"
					className="mail-snackbar-action"
					onClick={() => {
						clearNotice();
						notice.action?.();
					}}
				>
					{notice.actionLabel || "Undo"}
				</button>
			)}
			<button
				type="button"
				className="mail-snackbar-close"
				aria-label="Dismiss notification"
				onClick={clearNotice}
			>
				<XIcon size={18} />
			</button>
		</div>
	);
}

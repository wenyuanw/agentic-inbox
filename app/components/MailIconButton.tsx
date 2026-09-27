import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Tooltip } from "@cloudflare/kumo";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
	label: string;
	active?: boolean;
}

const MailIconButton = forwardRef<HTMLButtonElement, Props>(
	function MailIconButton(
		{ label, active, className = "", children, ...props },
		ref,
	) {
		return (
			<Tooltip content={label} side="bottom" asChild>
				<button
					ref={ref}
					type="button"
					aria-label={label}
					className={`mail-icon-button ${active ? "is-active" : ""} ${className}`}
					{...props}
				>
					{children}
				</button>
			</Tooltip>
		);
	},
);

export default MailIconButton;

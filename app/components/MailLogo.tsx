interface MailLogoProps {
	size?: number;
	className?: string;
}

/** Shared cloud-envelope mark. Decorative wherever the adjacent text names the app. */
export default function MailLogo({ size = 40, className }: MailLogoProps) {
	return <img src="/brand/agentic-inbox.svg" alt="" aria-hidden="true" width={size} height={size} className={className} />;
}

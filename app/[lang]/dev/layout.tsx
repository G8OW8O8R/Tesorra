import { notFound } from "next/navigation";

// Workbench pages exist only in development.
export default function DevLayout({ children }: LayoutProps<"/[lang]/dev">) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}

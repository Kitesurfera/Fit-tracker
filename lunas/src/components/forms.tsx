"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Formulario que llama a una Server Action y muestra el mensaje de error o de éxito. */
export function ActionForm({
  action,
  children,
  className,
  confirmText,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  /** Pide confirmación antes de enviar (por ejemplo, al borrar). */
  confirmText?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [visible, setVisible] = useState<ActionState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVisible(state);
    if (timer.current) clearTimeout(timer.current);
    if (state?.message) timer.current = setTimeout(() => setVisible(null), 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);

  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      {visible?.error && (
        <p className="form-msg form-error" role="alert">
          {visible.error}
        </p>
      )}
      {visible?.message && (
        <p className="form-msg form-ok" role="status">
          {visible.message}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  className = "btn btn-primary",
  pendingText = "Un momento…",
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  // Con varios botones en el mismo formulario, solo cambia el texto del que se ha pulsado
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={mine} name={name} value={value}>
      {mine ? pendingText : children}
    </button>
  );
}

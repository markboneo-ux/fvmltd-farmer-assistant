export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-medium text-danger" role="alert">
      {message}
    </p>
  );
}

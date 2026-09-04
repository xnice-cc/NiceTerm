import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { QuickCommand } from "@/types/global";

interface DeleteQuickCommandDialogProps {
  command: QuickCommand | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteQuickCommandDialog({
  command,
  onCancel,
  onConfirm,
}: DeleteQuickCommandDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog
      open={!!command}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("quickCommands.delete")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("quickCommands.deleteConfirm", { name: command?.label })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

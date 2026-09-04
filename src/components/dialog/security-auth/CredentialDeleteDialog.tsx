import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SavedCredential } from "@/types/global";

interface CredentialDeleteDialogProps {
  entry: SavedCredential | null;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CredentialDeleteDialog({
  entry,
  onOpenChange,
  onCancel,
  onConfirm,
}: CredentialDeleteDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("credentialManager.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("credentialManager.deleteConfirm", { name: entry?.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

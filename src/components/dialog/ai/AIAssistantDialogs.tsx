import { AutoExecutionConfirmDialog } from "./AutoExecutionConfirmDialog";
import { ClearAIHistoryDialog } from "./ClearAIHistoryDialog";

interface AIAssistantDialogsProps {
  clearHistoryOpen: boolean;
  clearingHistory: boolean;
  autoModeDialogOpen: boolean;
  onClearHistoryOpenChange: (open: boolean) => void;
  onAutoModeDialogOpenChange: (open: boolean) => void;
  onClearHistory: () => void;
  onConfirmAutoExecutionMode: () => void;
}

export function AIAssistantDialogs({
  clearHistoryOpen,
  clearingHistory,
  autoModeDialogOpen,
  onClearHistoryOpenChange,
  onAutoModeDialogOpenChange,
  onClearHistory,
  onConfirmAutoExecutionMode,
}: AIAssistantDialogsProps) {
  return (
    <>
      <ClearAIHistoryDialog
        open={clearHistoryOpen}
        clearing={clearingHistory}
        onOpenChange={onClearHistoryOpenChange}
        onConfirm={onClearHistory}
      />

      <AutoExecutionConfirmDialog
        open={autoModeDialogOpen}
        onOpenChange={onAutoModeDialogOpenChange}
        onConfirm={onConfirmAutoExecutionMode}
      />
    </>
  );
}

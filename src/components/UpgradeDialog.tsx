import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Zap } from "lucide-react";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Anfragen", "Uploads", "Pseudonymisierungen" */
  limitType: string;
  /** e.g. "25/25" */
  usageText?: string;
}

export function UpgradeDialog({ open, onOpenChange, limitType, usageText }: UpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">
            {limitType}-Limit erreicht
          </DialogTitle>
          <DialogDescription className="text-center">
            {usageText
              ? `Sie haben ${usageText} ${limitType} in diesem Monat verbraucht.`
              : `Ihr monatliches ${limitType}-Limit ist ausgeschöpft.`}
            {" "}Upgraden Sie Ihren Plan, um weiterzuarbeiten.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild className="w-full gap-2">
            <Link to="/settings?tab=billing">
              <Zap className="h-4 w-4" />
              Plan upgraden
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Später
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

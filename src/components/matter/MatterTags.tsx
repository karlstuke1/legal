import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, X, Tag } from "lucide-react";
import { type MatterTag, addMatterTag, deleteMatterTag } from "@/lib/matters-api";
import { toast } from "@/hooks/use-toast";

const TAG_COLORS = [
  { name: "gray", bg: "bg-muted", text: "text-muted-foreground", border: "border-border/40" },
  { name: "red", bg: "bg-red-500/10", text: "text-red-600", border: "border-red-500/20" },
  { name: "blue", bg: "bg-blue-500/10", text: "text-blue-600", border: "border-blue-500/20" },
  { name: "green", bg: "bg-emerald-500/10", text: "text-emerald-600", border: "border-emerald-500/20" },
  { name: "yellow", bg: "bg-amber-500/10", text: "text-amber-700", border: "border-amber-500/20" },
  { name: "purple", bg: "bg-purple-500/10", text: "text-purple-600", border: "border-purple-500/20" },
];

function getTagColor(color: string) {
  return TAG_COLORS.find((c) => c.name === color) || TAG_COLORS[0];
}

interface MatterTagsProps {
  tags: MatterTag[];
  matterId: string;
  workspaceId: string;
  onTagsChange: (tags: MatterTag[]) => void;
}

export default function MatterTags({ tags, matterId, workspaceId, onTagsChange }: MatterTagsProps) {
  const [newLabel, setNewLabel] = useState("");
  const [selectedColor, setSelectedColor] = useState("gray");
  const [open, setOpen] = useState(false);

  const handleAdd = async () => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const tag = await addMatterTag(matterId, workspaceId, trimmed, selectedColor);
    if (tag) {
      onTagsChange([...tags, tag]);
      setNewLabel("");
      setSelectedColor("gray");
      setOpen(false);
    } else {
      toast({ title: "Fehler beim Erstellen des Tags", variant: "destructive" });
    }
  };

  const handleDelete = async (tagId: string) => {
    const ok = await deleteMatterTag(tagId);
    if (ok) {
      onTagsChange(tags.filter((t) => t.id !== tagId));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => {
        const color = getTagColor(tag.color);
        return (
          <Badge
            key={tag.id}
            variant="outline"
            className={`text-[11px] font-medium gap-1 pr-1 ${color.bg} ${color.text} ${color.border}`}
          >
            {tag.label}
            <button
              onClick={() => handleDelete(tag.id)}
              className="ml-0.5 hover:opacity-70 transition-opacity"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        );
      })}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground/50 hover:text-foreground gap-1"
          >
            <Plus className="h-3 w-3" />
            Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3 space-y-3" align="start">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label…"
            className="h-8 text-[13px] rounded-lg"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            autoFocus
          />
          <div className="flex gap-1.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c.name}
                onClick={() => setSelectedColor(c.name)}
                className={`h-5 w-5 rounded-full ${c.bg} border-2 transition-all ${
                  selectedColor === c.name ? "border-foreground/50 scale-110" : "border-transparent"
                }`}
              />
            ))}
          </div>
          <Button
            size="sm"
            className="w-full h-7 text-[12px] rounded-lg"
            onClick={handleAdd}
            disabled={!newLabel.trim()}
          >
            <Tag className="h-3 w-3 mr-1.5" />
            Hinzufügen
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

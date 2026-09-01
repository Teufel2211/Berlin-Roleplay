import { notFound } from "next/navigation";
import { requireGuild } from "@/lib/guild";
import { getComponentTemplate } from "@/lib/queries";
import { ModuleHeader, Panel } from "@/components/ui";
import { ComponentEditor } from "@/components/component-editor";

export default async function ComponentTemplateDetailPage({
  params,
}: {
  params: Promise<{ guildId: string; templateId: string }>;
}) {
  const { guildId, templateId } = await params;
  const guild = await requireGuild(guildId);
  const template = await getComponentTemplate(guildId, templateId);

  if (!template) notFound();

  return (
    <div>
      <ModuleHeader
        title={`Components · ${guild.guildName}`}
        description={`Template: ${template.name}`}
      />

      <Panel>
        <ComponentEditor guildId={guildId} template={template} />
      </Panel>
    </div>
  );
}

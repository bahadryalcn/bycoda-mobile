import { useState } from "react";
import { Linking, View } from "react-native";
import ListFilter from "lucide-react-native/icons/list-filter";
import { type ComponentCatalogEntry, componentCatalog } from "./catalog";
import {
  filterGalleryCatalog,
  galleryExampleFor,
  galleryGroups,
  type GalleryExample,
  type GalleryGroup,
} from "./component-gallery-model";
import { useCopy } from "./copy";
import { ToggleField } from "./fields";
import { SearchField } from "./search-field";
import { SelectField } from "./select-field";
import { Body, CodeText, Heading } from "./typography";
import { Button, IconButton } from "./buttons";
import { Row, Stack } from "./layout";
import { NavigationGroup, NavigationRow } from "./navigation-row";
import { Badge, Empty, Notice } from "./feedback";
import { Sheet } from "./dialogs";
import { colors } from "./tokens";
import { uiStyles } from "./styles";
import { decorativeSvgProps } from "./accessibility";

const pageSize = 20;

export function GalleryCatalog({ onExample }: { onExample: (example: GalleryExample) => void }) {
  const copy = useCopy();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<GalleryGroup>();
  const [coreOnly, setCoreOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(pageSize);
  const [selected, setSelected] = useState<ComponentCatalogEntry>();
  const [linkFailed, setLinkFailed] = useState(false);
  const matches = filterGalleryCatalog({ search, group, coreOnly });
  const filtersActive = Boolean(group || coreOnly);
  const groupLabels: Record<GalleryGroup, string> = {
    forms: copy("Formlar", "Forms"),
    chat: copy("Sohbet", "Chat"),
    layout: copy("Yerleşim", "Layout"),
    navigation: copy("Gezinme", "Navigation"),
    overlays: copy("Paneller", "Overlays"),
    data: copy("Veri", "Data"),
    media: copy("Medya", "Media"),
  };
  const example = selected ? galleryExampleFor(selected.id) : undefined;
  const useCases: Record<GalleryGroup, string> = {
    forms: copy("Proje, oturum ve tercih alanları.", "Project, session and preference fields."),
    chat: copy(
      "Konuşma, dosyalar, agent planı ve işlem durumu.",
      "Conversations, files, agent plans and operation state.",
    ),
    layout: copy(
      "Ekran düzeni, durumlar ve ortak içerik yüzeyleri.",
      "Screen layout, states and shared content surfaces.",
    ),
    navigation: copy(
      "Proje, oturum, sekme ve dosyalar arasında gezinme.",
      "Moving between projects, sessions, tabs and files.",
    ),
    overlays: copy(
      "Seçim, ayrıntılar ve onay akışları.",
      "Selection, details and confirmation flows.",
    ),
    data: copy(
      "Kullanım, ilerleme ve çalışma verilerinin gösterimi.",
      "Presenting usage, progress and workspace data.",
    ),
    media: copy(
      "Görsel, ses ve belge içeriğinin gösterimi.",
      "Presenting image, audio and document content.",
    ),
  };
  return (
    <Stack>
      <Row>
        <View style={uiStyles.grow}>
          <SearchField
            label={copy("Bileşen ara", "Search components")}
            placeholder={copy("Örn. attachment, table, forms", "e.g. attachment, table, forms")}
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              setLimit(pageSize);
            }}
          />
        </View>
        <IconButton
          label={copy("Filtreler", "Filters")}
          expanded={filtersOpen}
          tone={filtersActive ? "primary" : "default"}
          onPress={() => setFiltersOpen(true)}
        >
          <ListFilter
            {...decorativeSvgProps}
            size={18}
            color={filtersActive ? colors.primaryText : colors.muted}
          />
        </IconButton>
      </Row>
      <Body muted accessibilityLiveRegion="polite">
        {copy("{p0} / {p1} bileşen", "{p0} / {p1} components", {
          p0: String(matches.length),
          p1: String(componentCatalog.length),
        })}
      </Body>
      {matches.length ? (
        <NavigationGroup>
          {matches.slice(0, limit).map((item) => (
            <NavigationRow
              key={item.id}
              label={item.id}
              detail={groupLabels[item.group]}
              trailing={
                galleryExampleFor(item.id) ? <Badge label={copy("Örnek", "Example")} /> : undefined
              }
              onPress={() => {
                setSelected(item);
                setLinkFailed(false);
              }}
            />
          ))}
        </NavigationGroup>
      ) : (
        <Empty title={copy("Bileşen bulunamadı", "No components found")} />
      )}
      {matches.length > limit ? (
        <Button
          label={copy("Daha fazla göster", "Show more")}
          tone="secondary"
          onPress={() => setLimit((value) => value + pageSize)}
        />
      ) : null}
      <Sheet
        visible={filtersOpen}
        title={copy("Filtreler", "Filters")}
        onClose={() => setFiltersOpen(false)}
      >
        <SelectField<GalleryGroup | "all">
          label={copy("Kategori", "Category")}
          value={group ?? "all"}
          options={[
            { value: "all", label: copy("Tümü", "All") },
            ...galleryGroups.map((value) => ({ value, label: groupLabels[value] })),
          ]}
          searchable={false}
          onChange={(value) => {
            setGroup(value === "all" ? undefined : value);
            setLimit(pageSize);
          }}
        />
        <ToggleField
          label={copy("Öncelikli bileşenler", "Core components")}
          value={coreOnly}
          onChange={(value) => {
            setCoreOnly(value);
            setLimit(pageSize);
          }}
        />
        <Button
          label={copy("Sıfırla", "Reset")}
          tone="quiet"
          disabled={!filtersActive}
          onPress={() => {
            setGroup(undefined);
            setCoreOnly(false);
            setLimit(pageSize);
          }}
        />
      </Sheet>
      <Sheet
        visible={Boolean(selected)}
        title={selected?.id ?? "PanelUI"}
        onClose={() => setSelected(undefined)}
      >
        {selected ? (
          <>
            <Row>
              <Badge label={groupLabels[selected.group]} />
              <Badge
                label={
                  selected.priority === "core"
                    ? copy("Öncelikli", "Core")
                    : copy("Kullanılabilir", "Available")
                }
              />
            </Row>
            <Body>{useCases[selected.group]}</Body>
            {selected.capability !== "universal" ? (
              <Notice
                tone="warning"
                message={
                  selected.capability === "optional-native-map"
                    ? copy(
                        "Harita için isteğe bağlı native entegrasyon ve uyumlu bir geliştirme derlemesi gerekir.",
                        "Maps require the optional native integration and a compatible development build.",
                      )
                    : copy(
                        "Bu bileşen için ayrıca hizmet kurulumu gerekir. Kütüphanede bulunması hizmeti etkinleştirmez.",
                        "This component requires separate service setup. Library availability does not enable the service.",
                      )
                }
              />
            ) : null}
            <Heading>{copy("Bileşen yolu", "Component import")}</Heading>
            <CodeText>{`panelui-native/components/${selected.id}`}</CodeText>
            <Body muted>
              {copy(
                "Ürün ekranları ortak bycoda bileşenlerini kullanır. Bu yol ortak katmanı genişletmek içindir.",
                "Product screens use shared bycoda components. This import extends the shared layer.",
              )}
            </Body>
            {example ? (
              <Button
                label={copy("Çalışan örneği aç", "Open interactive example")}
                onPress={() => {
                  setSelected(undefined);
                  onExample(example);
                }}
              />
            ) : null}
            <Button
              label={copy("PanelUI belgelerini aç", "Open PanelUI documentation")}
              tone="secondary"
              onPress={() => {
                void Linking.openURL(selected.docs).catch(() => setLinkFailed(true));
              }}
            />
            {linkFailed ? (
              <Notice
                tone="danger"
                message={copy("Bağlantı açılamadı.", "Could not open the link.")}
              />
            ) : null}
          </>
        ) : null}
      </Sheet>
    </Stack>
  );
}

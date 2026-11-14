import { SelectGroup, SelectItem, SelectLabel } from "@tsuke/ui/components/select";
import type { CategoryWithGenres } from "@/ledger/masters";
import { categoryValueOf } from "@/web/categoryValue";

/**
 * カテゴリと内訳の選択肢。値は `categoryValueOf` の形にする。内訳は字下げしてカテゴリの下に並べる。
 */
export const CategoryOptions = ({
  label,
  categories,
}: {
  label: string;
  categories: CategoryWithGenres[];
}) => (
  <SelectGroup>
    <SelectLabel>{label}</SelectLabel>
    {categories.map((category) => [
      <SelectItem key={`c${category.id}`} value={categoryValueOf(category.id, null)}>
        {category.name}
      </SelectItem>,
      ...category.genres.map((genre) => (
        <SelectItem key={`g${genre.id}`} value={categoryValueOf(category.id, genre.id)} inset>
          {genre.name}
        </SelectItem>
      )),
    ])}
  </SelectGroup>
);

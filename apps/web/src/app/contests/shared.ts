/** DMOJ's `ContestList.paginate_by`. */
export const PAST_PER_PAGE = 20;

export type ContestListArgs = {
  paginationOpts: { numItems: number; cursor: string };
  search?: string;
  tagName?: string;
  sort: string;
  descending: boolean;
};

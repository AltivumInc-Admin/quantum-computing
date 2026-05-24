export interface Section {
  slug: string;
  title: string;
  index: number;
  dirName: string;
  notebookCount: number;
}

const sections: Section[] = [
  { slug: "00-foundations", title: "Quantum Computing Foundations", index: 0, dirName: "00-foundations", notebookCount: 5 },
  { slug: "01-hardware", title: "Quantum Hardware on Amazon Braket", index: 1, dirName: "01-hardware", notebookCount: 6 },
  { slug: "02-algorithms", title: "Quantum Algorithms", index: 2, dirName: "02-algorithms", notebookCount: 6 },
  { slug: "03-quantum-ml", title: "Quantum Machine Learning", index: 3, dirName: "03-quantum-ml", notebookCount: 7 },
  { slug: "04-quantum-chemistry", title: "Quantum Chemistry & Biochemistry", index: 4, dirName: "04-quantum-chemistry", notebookCount: 8 },
  { slug: "05-hybrid-jobs", title: "Production Hybrid Quantum-Classical Jobs", index: 5, dirName: "05-hybrid-jobs", notebookCount: 7 },
];

export function getSections(): Section[] {
  return sections;
}

export function getSectionBySlug(slug: string): Section | undefined {
  return sections.find((s) => s.slug === slug);
}

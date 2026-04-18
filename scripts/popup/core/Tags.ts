import { getAllTags } from "../../shared/db/Storage";
import { type AllHermidata } from "../../shared/types";
import { getElement } from "../../utils/Selection";
import { levenshteinDistance, PastHermidata } from "./Past";

export class TagAutocomplete {
    private AllTags: Map<string, number> = new Map();

    constructor(allHermidata: AllHermidata) {
        this.AllTags = getAllTags(allHermidata);
    }
    
    public getSuggestions(input: string, limit = 5): string[] {
        if (!input.trim()) return [];
        
        const normalized = input.toLowerCase().trim();

        const allTagsValues = Array.from(this.AllTags.keys());
        
        // Exact match first
        const exact = allTagsValues.filter(tag => 
            tag.toLowerCase() === normalized
        );
        
        // Starts with
        const startsWith = allTagsValues.filter(tag => 
            tag.toLowerCase().startsWith(normalized) &&
            !exact.includes(tag)
        );
        
        // Contains
        const contains = allTagsValues.filter(tag => 
            tag.toLowerCase().includes(normalized) && 
            !exact.includes(tag) && 
            !startsWith.includes(tag)
        );
        
        // Fuzzy match (Levenshtein distance)
        const fuzzy = allTagsValues
            .filter(tag => !exact.includes(tag) && !startsWith.includes(tag) && !contains.includes(tag))
            .map(tag => ({
                tag,
                distance: levenshteinDistance(normalized, tag.toLowerCase())
            }))
            .filter(({ distance }) => distance <= 3) // Max 3 character difference
            .sort((a, b) => a.distance - b.distance)
            .map(({ tag }) => tag);
        
        return [...exact, ...startsWith, ...contains, ...fuzzy].slice(0, limit);
    }
}

class SimplerInlineAutocomplete {
    private autocomplete;
    private input: HTMLInputElement;
    
    constructor(inputSelector: string, AllHermidata: AllHermidata) {
        this.autocomplete = new TagAutocomplete(AllHermidata);
        this.input = document.querySelector(inputSelector)!;
        this.bindEvents();
    }
    
    private bindEvents(): void {
        this.input.addEventListener('input', () => {
            const value = this.input.value.trim();
            
            if (!value) {
                this.input.placeholder = 'add tag...';
                return;
            }
            
            const suggestions = this.autocomplete.getSuggestions(value, 1);
            const topSuggestion = suggestions[0];
            
            if (topSuggestion && topSuggestion.toLowerCase().startsWith(value.toLowerCase())) {
                // Show completion hint in placeholder
                const completion = topSuggestion.slice(value.length);
                this.input.placeholder = value + completion;
            } else {
                this.input.placeholder = '';
            }
        });
        
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                
                const placeholder = this.input.placeholder;
                if (placeholder && placeholder.startsWith(this.input.value)) {
                    // Accept suggestion
                    this.addTag(placeholder);
                } else if (this.input.value.trim()) {
                    // Add current value
                    this.addTag(normalizeTag(this.input.value));
                }
            }
        });
        
        this.input.addEventListener('blur', () => {
            this.input.placeholder = 'add tag...';
        });
    }
    
    private addTag(tag: string): void {
        //this.createTagPill(tag);
        this.input.value = '';
        this.input.placeholder = 'add tag...';
    }
}

function normalizeTag(input: string): string {
    return input
        .trim()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

export class TagsSystem {
    private autocomplete: TagAutocomplete | null = null;
    private input: HTMLInputElement | null = null;
    private ghostInput: HTMLSpanElement | null = null;



    async init() {
        const input = getElement<HTMLInputElement>('#tags');
        const ghostInput = getElement<HTMLSpanElement>('.autocomplete-ghost');

        const tagsController = new TagAutocomplete(await PastHermidata.getAllHermidata());
        if (!input || !ghostInput || !tagsController) return;
        this.input = input;
        this.ghostInput = ghostInput;
        this.autocomplete = tagsController;


        this.bindEvents();
    }


    public CreatePill(tag: string, color: string): HTMLDivElement {
        const pill = document.createElement("div");
        pill.classList.add(`tag-pill`);
        pill.dataset.color = color;
        pill.textContent = tag;
        pill.style.backgroundColor = color;
        return pill;
    }

    private bindEvents(): void {
        const input = this.input;
        const ghostInput = this.ghostInput;
        const autocomplete = this.autocomplete;
        if (!input || !ghostInput || !autocomplete) return;
        input.addEventListener('input', () => {

            const value = input.value.trim()

            const topSuggestion = autocomplete.getSuggestions(value, 1)[0]
            
            if (topSuggestion && topSuggestion.toLowerCase().startsWith(value.toLowerCase())) {
                // Show completion hint in placeholder
                const completion = topSuggestion.slice(value.length);
                ghostInput.textContent = value + completion;
            } else {
                ghostInput.textContent = '';
                }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                this.acceptSuggestion(input, ghostInput);
            }

            // Arrow right at end of input accepts suggestion
            if (e.key === 'ArrowRight' &&  input.selectionStart === input.value.length && ghostInput.textContent) {
                e.preventDefault();
                this.acceptSuggestion(input, ghostInput);
            }
            
            // Escape clears suggestion
            if (e.key === 'Escape') {
                ghostInput.textContent = '';
            }
            
        });
        input.addEventListener('blur', () => {
            ghostInput.textContent = '';
        });
        
        input.addEventListener('focus', () => {
            this.updateGhostText(input, ghostInput, autocomplete);
        });
    }
    private updateGhostText(input: HTMLInputElement, ghostSpan: HTMLSpanElement, autocomplete: TagAutocomplete): void {
        const value = input.value;
        
        if (!value.trim()) {
            ghostSpan.textContent = '';
            return;
        }
        
        const suggestions = autocomplete.getSuggestions(value, 1);
        const topSuggestion = suggestions[0];
        
        if (topSuggestion && topSuggestion.toLowerCase().startsWith(value.toLowerCase())) {
            // Show the completion part in gray
            const completion = topSuggestion.slice(value.length);
            ghostSpan.textContent = value + completion;
        } else {
            ghostSpan.textContent = '';
        }
    }
    private acceptSuggestion(input: HTMLInputElement, ghostSpan: HTMLSpanElement): void {
        const placeholder = ghostSpan.textContent;
        const pillContainer = getElement<HTMLDivElement>('#tag-pill-container');
        if (!pillContainer) return;
        
        if (placeholder) {
            // Accept suggestion
            const pill = this.CreatePill(placeholder, '#3c5ca6');
            pillContainer.appendChild(pill);
        } else if (input.value.trim()) {
            // Add current value
            const pill = this.CreatePill(this.normalizeTag(input.value), '#3c5ca6');
            pillContainer.appendChild(pill);

        }
        ghostSpan.textContent = '';
        input.textContent = '';
    }
        private normalizeTag(input: string): string {
        return input
            .trim()
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

}
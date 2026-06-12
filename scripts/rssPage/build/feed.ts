import { removeHermidata } from "../../shared/db/Storage";
import type { Hermidata, Settings } from "../../shared/types";
import { RSSPageBuilder } from "../build";

export class feed extends RSSPageBuilder {

    private readonly AllHermidataContainer: HTMLDivElement | null = document.querySelector('.all-entries-container');

    constructor(allHermidata: Record<string, Hermidata>, settings: Settings) {
        super(allHermidata, settings);
    }

    public async build(): Promise<void> {
        await this.init();
        const allHermidata = this.AllHermidata;
        if (!allHermidata) return;
        for (const feed of Object.values(allHermidata)) {
            this.buildMainFeed(feed);
        }
    }


    public async reload(): Promise<void> {
        this.AllHermidataContainer!.innerHTML = '';
        await this.build();
    }




    private buildMainFeed(hermidataFeed: Hermidata) {
        const feed = document.createElement('div');
        feed.className = 'feed';
        feed.dataset.id = hermidataFeed.id;
        
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'checkbox';
        checkbox.dataset.id = hermidataFeed.id;
        feed.append(checkbox);
        
        
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = hermidataFeed.title;
        title.onclick = () => window.open(hermidataFeed.url, '_blank');
        

        const ViewBtn = document.createElement('button');
        ViewBtn.className = 'Btn';
        ViewBtn.textContent = 'View';
        ViewBtn.addEventListener('click', () => {
            this.openDetails(hermidataFeed.id);
        });


        const removeBtn = document.createElement('button');
        removeBtn.className = 'Btn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', async () => {
            const confirm = window.confirm('Are you sure you want to remove this feed?');
            if (confirm) await removeHermidata(hermidataFeed.id);
        });
        
        feed.append(title, ViewBtn, removeBtn);
        this.AllHermidataContainer!.appendChild(feed);
    }


}
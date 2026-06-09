import { removeHermidata } from "../../shared/db/Storage";
import type { Hermidata } from "../../shared/types";
import { RSSPageBuilder } from "../build";

export abstract class feed extends RSSPageBuilder {

    protected readonly AllHermidataContainer: HTMLDivElement | null = document.querySelector('.entries');


    protected build(): void {
        this.init();
        const allHermidata = this.AllHermidata;
        if (!allHermidata) return;
        for (const feed of Object.values(allHermidata)) {
            this.buildMainFeed(feed);
        }
    }


    protected reload(): void {
        this.AllHermidataContainer!.innerHTML = '';
        this.build();
    }




    private buildMainFeed(hermidataFeed: Hermidata) {
        const feed = document.createElement('div');
        feed.className = 'feed';
        feed.dataset.id = hermidataFeed.id;
        feed.onclick = () => window.open(hermidataFeed.url, '_blank');


        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'checkbox';
        checkbox.dataset.id = hermidataFeed.id;
        feed.append(checkbox);


        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = hermidataFeed.title;
        

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
            await removeHermidata(hermidataFeed.id);
        });
        
        feed.append(title, ViewBtn, removeBtn);
        this.AllHermidataContainer!.appendChild(feed);
    }


}
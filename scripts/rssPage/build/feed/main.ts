import { feed } from "../feed";

export class mainFeed extends feed {
    protected build(): void {
        for (const feed of this.AllHermidata) {
            this.buildMainFeed(feed);
        }
    }


    protected reload(): void {}




    private buildMainFeed(){
        const feed = document.createElement('div');
        feed.className = 'feed';
        feed.dataset.id = 
    }


}
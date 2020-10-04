import { Component, Inject, Input, OnInit, Output, EventEmitter, OnDestroy } from '@angular/core';
import { DIAGNOSTIC_DATA_CONFIG, DiagnosticDataConfig } from '../../config/diagnostic-data-config';
import { TelemetryService } from '../../services/telemetry/telemetry.service';
import { map, catchError, delay, retryWhen, take } from 'rxjs/operators';
import { v4 as uuid } from 'uuid';
import { TelemetryEventNames } from '../../services/telemetry/telemetry.common';
import { DataRenderBaseComponent } from '../data-render-base/data-render-base.component';
import { ActivatedRoute, Router, Params } from '@angular/router';
import { GenericContentService } from '../../services/generic-content.service';
import { of, Observable, forkJoin } from 'rxjs';
import { ISubscription } from "rxjs/Subscription";
import { WebSearchConfiguration } from '../../models/search';
import { GenericDocumentsSearchService } from '../../services/generic-documents-search.service';
import { GenericResourceService } from '../../services/generic-resource-service';

@Component({
    selector: 'web-search',
    templateUrl: './web-search.component.html',
    styleUrls: ['./web-search.component.scss']
})

export class WebSearchComponent extends DataRenderBaseComponent implements OnInit {
    isPublic: boolean = false;
    viewRemainingArticles : boolean = false;
    deepSearchEnabled : boolean = false;
    @Input() searchTerm: string = '';
    @Input() searchId: string = '';
    @Input() isChildComponent: boolean = true;
    @Input('webSearchConfig') webSearchConfig: WebSearchConfiguration;
    @Input() searchResults: any[] = [];
    @Input() numArticlesExpanded : number = 5;
    @Output() searchResultsChange: EventEmitter<any[]> = new EventEmitter<any[]>();
    pesId : string = "";

    searchTermDisplay: string = '';
    showSearchTermPractices: boolean = false;
    showPreLoader: boolean = false;
    showPreLoadingError: boolean = false;
    preLoadingErrorMessage: string = "Some error occurred while fetching web results."
    subscription: ISubscription;
    
    constructor(@Inject(DIAGNOSTIC_DATA_CONFIG) config: DiagnosticDataConfig, public telemetryService: TelemetryService,
        private _activatedRoute: ActivatedRoute, private _router: Router, private _contentService: GenericContentService,
        private _documentsSearchService : GenericDocumentsSearchService,
        private _resourceService: GenericResourceService  ) {
        super(telemetryService);
        this.isPublic = config && config.isPublic;
        const subscription = this._activatedRoute.queryParamMap.subscribe(qParams => {
            this.searchTerm = qParams.get('searchTerm') === null ? "" || this.searchTerm : qParams.get('searchTerm');
            this.getPesId();
            this.checkIfDeepSearchIsEnabled();
            this.refresh();
        });
        this.subscription = subscription;
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }
    
    ngOnInit() {
        if(!this.isChildComponent)
        {
            this.refresh();
        }
    }

    refresh() {
        if (this.searchTerm && this.searchTerm.length > 1) {
            setTimeout(()=> {this.triggerSearch();}, 500);
        }
    }

    clearSearchTerm() {
        this.searchTerm = "";
    }

    handleRequestFailure() {
        this.showPreLoadingError = true;
        this.showPreLoader = false;
        this.showSearchTermPractices = false;
    }

    mergeResults(results) {
        var finalResults = results[0];
        if (!(finalResults.webPages && finalResults.webPages.value && finalResults.webPages.value.length > 0)) {
            finalResults = {
                webPages: {
                    value: []
                }
            };
        }
        if (results.length>1) {
            if (results[1].webPages && results[1].webPages.value && results[1].webPages.value.length > 0) {
                results[1].webPages.value.forEach(result => {
                    var idx = finalResults.webPages.value.findIndex(x => x.url==result.url);
                    if (idx<0) {
                        finalResults.webPages.value.push(result);
                    }
                });
            }
        }
        return finalResults;
    }

    triggerSearch() {
        if (!this.isChildComponent){
            const queryParams: Params = { searchTerm: this.searchTerm };
            this._router.navigate(
                [],
                {
                    relativeTo: this._activatedRoute,
                    queryParams: queryParams,
                    queryParamsHandling: 'merge'
                }
            );
        }
        this.resetGlobals();
        if (!this.isChildComponent || !this.searchId || this.searchId.length <1) this.searchId = uuid();
        if (!this.webSearchConfig) {
            this.webSearchConfig = new WebSearchConfiguration(this.pesId);
        }
        let searchTasks = [];
        if (this.webSearchConfig && this.webSearchConfig.PreferredSites && this.webSearchConfig.PreferredSites.length>0) {
            searchTasks.push(
                this._contentService.searchWeb(this.searchTerm, this.webSearchConfig.MaxResults.toString(), this.webSearchConfig.UseStack, this.webSearchConfig.PreferredSites).pipe(map((res) => res), retryWhen(errors => {
                    let numRetries = 0;
                    return errors.pipe(delay(1000), map(err => {
                        if(numRetries++ === 3){
                            throw err;
                        }
                        return err;
                    }));
                }), catchError(e => {
                    throw e;
                }))
            );
        }
        searchTasks.push(
            this._contentService.searchWeb(this.searchTerm, this.webSearchConfig.MaxResults.toString(), this.webSearchConfig.UseStack, []).pipe(map((res) => res), retryWhen(errors => {
                let numRetries = 0;
                return errors.pipe(delay(1000), map(err => {
                    if(numRetries++ === 3){
                        throw err;
                    }
                    return err;
                }));
            }), catchError(e => {
                throw e;
            }))
        );
        this.showPreLoader = true;
        let onSearch = forkJoin(searchTasks).pipe(map(resultList => {
            this.showPreLoader = false;
            let results = this.mergeResults(resultList);
            if (results && results.webPages && results.webPages.value && results.webPages.value.length > 0) {
                this.searchResults = results.webPages.value.map(result => {
                    return {
                        title: result.name,
                        description: result.snippet,
                        link: result.url
                    };
                });
                this.searchResultsChange.emit(this.searchResults);
            }
            else {
                this.searchTermDisplay = this.searchTerm.valueOf();
                this.showSearchTermPractices = true;
            }
            this.logEvent(TelemetryEventNames.WebQueryResults, { searchId: this.searchId, query: this.searchTerm, results: JSON.stringify(this.searchResults.map(result => {
                return {
                    title: result.title.replace(";"," "),
                    description: result.description.replace(";", " "),
                    link: result.link
                };
            })), ts: Math.floor((new Date()).getTime() / 1000).toString() });
        }),
        catchError(err => {
            throw err;
        }));
        onSearch.subscribe(res => {}, (err) => {this.handleRequestFailure();});
    }

    selectResult(article: any) {
      window.open(article.link, '_blank');
      this.logEvent(TelemetryEventNames.WebQueryResultClicked, { searchId: this.searchId, article: JSON.stringify(article), ts: Math.floor((new Date()).getTime() / 1000).toString() });
    }
  
    getLinkText(link: string) {
      return !link || link.length < 20 ? link : link.substr(0, 25) + '...';
    }

    resetGlobals() {
        this.searchResults = [];
        this.showPreLoader = false;
        this.showPreLoadingError = false;
        this.showSearchTermPractices = false;
        this.searchTermDisplay = "";
    }

    viewOrHideAnchorTagText(viewRemainingArticles: boolean , 
                            totalDocuments : number,
                            numDocumentsExpanded : number){
    
        let remainingDocuments: string = "";
        if (totalDocuments && numDocumentsExpanded){
        remainingDocuments = `${totalDocuments - numDocumentsExpanded}`;
        remainingDocuments = viewRemainingArticles ?  `last ${remainingDocuments} ` : remainingDocuments
        }
    
        return !viewRemainingArticles ? `View ${remainingDocuments} more documents` : 
                        `Hide ${remainingDocuments} documents`;
    
     }
    

    showRemainingArticles(){
        this.viewRemainingArticles =!this.viewRemainingArticles
      }

    getPesId(){
        this._resourceService.getPesId().subscribe(pesId => {
            this.pesId = pesId;
        });    
    }
    
    checkIfDeepSearchIsEnabled () {
        let checkStatusTask = this._documentsSearchService
                                .IsEnabled(this.pesId, this.isPublic )
                                .pipe( map((res) => res), 
                                    retryWhen(errors => {
                                    let numRetries = 0;
                                    return errors.pipe(delay(1000), map(err => {
                                        if(numRetries++ === 3){
                                            throw err;
                                        }
                                        return err;
                                        }));
                                    }), 
                                    catchError(e => {
                                        throw e;
                                    })
                                    );
        checkStatusTask.subscribe((status) => {
                this.deepSearchEnabled = status;
                if (this.deepSearchEnabled) {
                    this.numArticlesExpanded = 2;
                }
            },
            (err) => {
                this.deepSearchEnabled = false;
            }
        );    
    }

}  

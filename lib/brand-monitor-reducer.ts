import { Company, CompetitorRanking, AnalysisStage, PartialResultData } from './types';

// Action Types
export type BrandMonitorAction =
  | { type: 'SET_URL'; payload: string }
  | { type: 'SET_URL_VALID'; payload: boolean | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ANALYZING'; payload: boolean }
  | { type: 'SET_PREPARING_ANALYSIS'; payload: boolean }
  | { type: 'SET_COMPANY'; payload: Company | null }
  | { type: 'SET_SHOW_INPUT'; payload: boolean }
  | { type: 'SET_SHOW_COMPANY_CARD'; payload: boolean }
  | { type: 'SET_SHOW_PROMPTS_LIST'; payload: boolean }
  | { type: 'SET_SHOW_COMPETITORS'; payload: boolean }
  | { type: 'SET_CUSTOM_PROMPTS'; payload: string[] }
  | { type: 'ADD_CUSTOM_PROMPT'; payload: string }
  | { type: 'REMOVE_DEFAULT_PROMPT'; payload: number }
  | { type: 'SET_AVAILABLE_PROVIDERS'; payload: string[] }
  | { type: 'SET_IDENTIFIED_COMPETITORS'; payload: IdentifiedCompetitor[] }
  | { type: 'REMOVE_COMPETITOR'; payload: number }
  | { type: 'ADD_COMPETITOR'; payload: IdentifiedCompetitor }
  | { type: 'UPDATE_COMPETITOR_METADATA'; payload: { index: number; metadata: CompetitorMetadata } }
  | { type: 'SET_ANALYSIS_PROGRESS'; payload: AnalysisProgressState }
  | { type: 'UPDATE_ANALYSIS_PROGRESS'; payload: Partial<AnalysisProgressState> }
  | { type: 'SET_PROMPT_COMPLETION_STATUS'; payload: PromptCompletionStatus }
  | { type: 'UPDATE_PROMPT_STATUS'; payload: { prompt: string; provider: string; status: PromptStatus } }
  | { type: 'SET_ANALYZING_PROMPTS'; payload: string[] }
  | { type: 'SET_ANALYSIS_TILES'; payload: AnalysisTile[] }
  | { type: 'UPDATE_ANALYSIS_TILE'; payload: { index: number; tile: AnalysisTile } }
  | { type: 'SET_ANALYSIS'; payload: Analysis | null }
  | { type: 'SET_ACTIVE_RESULTS_TAB'; payload: ResultsTab }
  | { type: 'SET_EXPANDED_PROMPT_INDEX'; payload: number | null }
  | { type: 'TOGGLE_MODAL'; payload: { modal: 'addPrompt' | 'addCompetitor'; show: boolean } }
  | { type: 'SET_NEW_PROMPT_TEXT'; payload: string }
  | { type: 'SET_NEW_COMPETITOR'; payload: { name?: string; url?: string } }
  | { type: 'RESET_STATE' }
  | { type: 'SCRAPE_SUCCESS'; payload: Company }
  | { type: 'ANALYSIS_COMPLETE'; payload: Analysis };

// State Interfaces
export interface IdentifiedCompetitor {
  name: string;
  url?: string;
  metadata?: CompetitorMetadata;
  loading?: boolean;
}

export interface CompetitorMetadata {
  ogImage?: string;
  favicon?: string;
  description?: string;
  validated?: boolean;
}

export type PromptStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface PromptCompletionStatus {
  [promptKey: string]: {
    [provider: string]: PromptStatus;
  };
}

export interface AnalysisProgressState {
  stage: AnalysisStage;
  progress: number;
  message: string;
  competitors?: string[];
  prompts?: string[];
  currentProvider?: string;
  currentPrompt?: string;
  partialResults?: PartialResultData[];
}

export interface AnalysisTile {
  prompt: string;
  providers: {
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: {
      brandMentioned: boolean;
      brandPosition?: number;
      sentiment: 'positive' | 'neutral' | 'negative';
    };
  }[];
}

export interface Analysis {
  company: Company;
  knownCompetitors: string[];
  prompts: any[]; // BrandPrompt[]
  responses: any[]; // AIResponse[]
  scores: {
    visibilityScore: number;
    sentimentScore: number;
    shareOfVoice: number;
    overallScore: number;
    averagePosition: number;
  };
  competitors: CompetitorRanking[];
  providerRankings?: any[]; // ProviderSpecificRanking[]
  providerComparison?: any[]; // ProviderComparisonData[]
  errors?: string[];
}

export type ResultsTab = 'visibility' | 'matrix' | 'rankings' | 'metrics' | 'prompts' | 'report';

export interface BrandMonitorState {
  // URL and validation
  url: string;
  urlValid: boolean | null;
  error: string | null;
  
  // Loading states
  loading: boolean;
  analyzing: boolean;
  preparingAnalysis: boolean;
  scrapingCompetitors: boolean;
  
  // Core data
  company: Company | null;
  analysis: Analysis | null;
  
  // UI state
  showInput: boolean;
  showCompanyCard: boolean;
  showPromptsList: boolean;
  showCompetitors: boolean;
  
  // Prompts
  customPrompts: string[];
  removedDefaultPrompts: number[];
  analyzingPrompts: string[];
  
  // Competitors
  identifiedCompetitors: IdentifiedCompetitor[];
  
  // Providers
  availableProviders: string[];
  
  // Analysis progress
  analysisProgress: AnalysisProgressState;
  promptCompletionStatus: PromptCompletionStatus;
  analysisTiles: AnalysisTile[];
  statusUpdateCount: number;
  
  // Results view
  activeResultsTab: ResultsTab;
  expandedPromptIndex: number | null;
  currentPeriod: boolean;
  
  // Modals
  showAddPromptModal: boolean;
  showAddCompetitorModal: boolean;
  newPromptText: string;
  newCompetitorName: string;
  newCompetitorUrl: string;
}

// Initial State
export const initialBrandMonitorState: BrandMonitorState = {
  url: '',
  urlValid: null,
  error: null,
  loading: false,
  analyzing: false,
  preparingAnalysis: false,
  scrapingCompetitors: false,
  company: null,
  analysis: null,
  showInput: true,
  showCompanyCard: false,
  showPromptsList: false,
  showCompetitors: false,
  customPrompts: [],
  removedDefaultPrompts: [],
  analyzingPrompts: [],
  identifiedCompetitors: [],
  availableProviders: [],
  analysisProgress: {
    stage: 'initializing',
    progress: 0,
    message: '',
    competitors: [],
    prompts: [],
    partialResults: []
  },
  promptCompletionStatus: {},
  analysisTiles: [],
  statusUpdateCount: 0,
  activeResultsTab: 'matrix',
  expandedPromptIndex: null,
  currentPeriod: true,
  showAddPromptModal: false,
  showAddCompetitorModal: false,
  newPromptText: '',
  newCompetitorName: '',
  newCompetitorUrl: ''
};

// Reducer
export function brandMonitorReducer(
  state: BrandMonitorState, 
  action: BrandMonitorAction
): BrandMonitorState {
  switch (action.type) {
    case 'SET_URL':
      return { ...state, url: action.payload };
      
    case 'SET_URL_VALID':
      return { ...state, urlValid: action.payload };
      
    case 'SET_ERROR':
      return { ...state, error: action.payload };
      
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
      
    case 'SET_ANALYZING':
      return { ...state, analyzing: action.payload };
      
    case 'SET_PREPARING_ANALYSIS':
      return { ...state, preparingAnalysis: action.payload };
      
    case 'SET_COMPANY':
      return { ...state, company: action.payload };
      
    case 'SET_SHOW_INPUT':
      return { ...state, showInput: action.payload };
      
    case 'SET_SHOW_COMPANY_CARD':
      return { ...state, showCompanyCard: action.payload };
      
    case 'SET_SHOW_PROMPTS_LIST':
      return { ...state, showPromptsList: action.payload };
      
    case 'SET_SHOW_COMPETITORS':
      return { ...state, showCompetitors: action.payload };
      
    case 'SET_CUSTOM_PROMPTS':
      return { ...state, customPrompts: action.payload };
      
    case 'ADD_CUSTOM_PROMPT':
      return { ...state, customPrompts: [...state.customPrompts, action.payload] };
      
    case 'REMOVE_DEFAULT_PROMPT':
      return { ...state, removedDefaultPrompts: [...state.removedDefaultPrompts, action.payload] };
      
    case 'SET_AVAILABLE_PROVIDERS':
      return { ...state, availableProviders: action.payload };
      
    case 'SET_IDENTIFIED_COMPETITORS':
      return { ...state, identifiedCompetitors: action.payload };
      
    case 'REMOVE_COMPETITOR':
      return { 
        ...state, 
        identifiedCompetitors: state.identifiedCompetitors.filter((_, i) => i !== action.payload) 
      };
      
    case 'ADD_COMPETITOR':
      return { 
        ...state, 
        identifiedCompetitors: [...state.identifiedCompetitors, action.payload] 
      };
      
    case 'UPDATE_COMPETITOR_METADATA':
      return {
        ...state,
        identifiedCompetitors: state.identifiedCompetitors.map((comp, idx) =>
          idx === action.payload.index 
            ? { ...comp, metadata: action.payload.metadata }
            : comp
        )
      };
      
    case 'SET_ANALYSIS_PROGRESS':
      return { ...state, analysisProgress: action.payload };
      
    case 'UPDATE_ANALYSIS_PROGRESS':
      return { 
        ...state, 
        analysisProgress: { ...state.analysisProgress, ...action.payload } 
      };
      
    case 'SET_PROMPT_COMPLETION_STATUS':
      return { ...state, promptCompletionStatus: action.payload };
      
    case 'UPDATE_PROMPT_STATUS':
      const { prompt, provider, status } = action.payload;
      const normalizedPrompt = prompt.trim();
      return {
        ...state,
        promptCompletionStatus: {
          ...state.promptCompletionStatus,
          [normalizedPrompt]: {
            ...state.promptCompletionStatus[normalizedPrompt],
            [provider]: status
          }
        },
        statusUpdateCount: state.statusUpdateCount + 1
      };
      
    case 'SET_ANALYZING_PROMPTS':
      return { ...state, analyzingPrompts: action.payload };
      
    case 'SET_ANALYSIS_TILES':
      return { ...state, analysisTiles: action.payload };
      
    case 'UPDATE_ANALYSIS_TILE':
      return {
        ...state,
        analysisTiles: state.analysisTiles.map((tile, idx) =>
          idx === action.payload.index ? action.payload.tile : tile
        )
      };
      
    case 'SET_ANALYSIS':
      return { ...state, analysis: action.payload };
      
    case 'SET_ACTIVE_RESULTS_TAB':
      return { ...state, activeResultsTab: action.payload };
      
    case 'SET_EXPANDED_PROMPT_INDEX':
      return { ...state, expandedPromptIndex: action.payload };
      
    case 'TOGGLE_MODAL':
      if (action.payload.modal === 'addPrompt') {
        return { ...state, showAddPromptModal: action.payload.show };
      } else {
        return { ...state, showAddCompetitorModal: action.payload.show };
      }
      
    case 'SET_NEW_PROMPT_TEXT':
      return { ...state, newPromptText: action.payload };
      
    case 'SET_NEW_COMPETITOR':
      return {
        ...state,
        ...(action.payload.name !== undefined && { newCompetitorName: action.payload.name }),
        ...(action.payload.url !== undefined && { newCompetitorUrl: action.payload.url })
      };
      
    case 'RESET_STATE':
      return initialBrandMonitorState;
      
    case 'SCRAPE_SUCCESS':
      return {
        ...state,
        company: action.payload,
        showInput: false,
        loading: false,
        error: null
      };
      
    case 'ANALYSIS_COMPLETE':
      return {
        ...state,
        analysis: action.payload,
        analyzing: false
      };
      
    default:
      return state;
  }
}
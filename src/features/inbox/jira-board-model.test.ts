import { expect,it } from "vitest";
import { readJiraBoardSnapshot,readJiraBoards,readJiraTransitions,readJiraWriteOutcome } from "./jira-board-model";
const issue={provider:"jira",kind:"jira",id:"7",identifier:"ENG-7",number:7,title:"Owner issue",url:"https://example.invalid/browse/ENG-7",state:"Open",statusId:"1",updatedAt:"2026-10-22T00:00:00Z",teamId:"1",repo:"ENG",projectPath:"",draft:false,labels:[],assignees:[]};
const snapshot={snapshotId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",projectCwd:"/project",board:{id:7,name:"Engineering",kind:"scrum"},configuration:{columns:[{name:"Open",statusIds:["1"]}],rankFieldId:10010,rankSnapshotAvailable:true,boardKind:"scrum",sprints:[{id:3,name:"Current",state:"active",goal:"Ship"}]},page:{issues:[issue],nextPageToken:null},scope:{scope:"board",sprintId:null,pageToken:null}};
it("projects bounded native board metadata while preserving exact status/sprint identities",()=>{
 const read=readJiraBoardSnapshot({...snapshot,token:"never-projected",account:{email:"never-projected"}});
 expect(read.page.issues[0]?.identifier).toBe("ENG-7");expect(read.configuration.columns[0]?.statusIds).toEqual(["1"]);expect(read.configuration.sprints[0]?.id).toBe(3);
 expect(JSON.stringify(read)).not.toContain("never-projected");
 expect(readJiraBoards([snapshot.board])).toEqual([snapshot.board]);
 for(const value of [{...snapshot,snapshotId:"current"},{...snapshot,page:{issues:[issue,issue],nextPageToken:null}},{...snapshot,page:{issues:Array(101).fill(issue),nextPageToken:null}},{...snapshot,configuration:{...snapshot.configuration,boardKind:"kanban"}}])expect(()=>readJiraBoardSnapshot(value)).toThrow();
});
it("keeps additional-field transitions visible and accepts only typed proof of no submission",()=>{
 expect(readJiraTransitions([{id:"4",name:"Resolve",statusId:"3",requiresFields:true}])[0]?.requiresFields).toBe(true);
 expect(readJiraWriteOutcome({outcome:"not-submitted",reason:"Native owner declined"})).toEqual({outcome:"not-submitted",reason:"Native owner declined"});
 expect(readJiraWriteOutcome({outcome:"submitted"})).toEqual({outcome:"submitted"});
 for(const value of [{approved:true},{outcome:"not-submitted"},{outcome:"submitted",reason:"unchecked"},null])expect(()=>readJiraWriteOutcome(value)).toThrow(/unconfirmed|Invalid/);
});
